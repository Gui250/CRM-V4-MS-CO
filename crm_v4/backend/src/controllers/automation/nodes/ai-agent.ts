import type { AppContext } from '../../../context.js'
import { type ChatTurn, PROVIDER_TIMEOUT_MS } from '../../../integrations/ai/index.js'
import { AGENT_TOOLS, FINISH_TOOL, HANDOFF_TOOL } from '../../../integrations/ai/tools.js'
import * as messageModel from '../../../models/message.js'
import { findAgent } from '../../ai-agents.js'
import { resolveCredentials } from '../../ai-providers.js'
import { sendAutomated } from '../../messages.js'
import { durationMs } from '../graph-schema.js'
import type { NodeExecutor, NodeInput, NodeResult, RunState } from './types.js'

// The AI agent block (US2): answers every new contact message, waits between them, and leaves
// by "completed", "no_reply", "unavailable", or a hand-off to a human.

export const AGENT_FAILED_REASON = 'Falha no agente de IA'
const AGENT_HANDOFF_REASON = 'O agente de IA pediu um atendente'

const MEDIA_LABELS: Record<string, string> = {
  image: '[imagem]',
  audio: '[áudio]',
  video: '[vídeo]',
  document: '[documento]',
  unsupported: '[mensagem não suportada]',
}

// The company's instructions come first; contact text only ever travels as user turns (research §5).
const CHANNEL_RULES = `

Regras do canal: você conversa pelo WhatsApp em nome da empresa, em português do Brasil, com mensagens curtas.
Use a ferramenta ${HANDOFF_TOOL} quando o contato pedir uma pessoa ou quando você não puder ajudar.
Use a ferramenta ${FINISH_TOOL} quando o atendimento terminar.`

async function historyTurns(ctx: AppContext, conversationId: string, size: number): Promise<ChatTurn[]> {
  const recent = await messageModel.listRecentForAgent(ctx.db, conversationId, size)
  return recent.map((m) => ({
    role: m.direction === 'inbound' ? 'user' : 'assistant',
    text: m.type === 'text' ? (m.body ?? '') : (MEDIA_LABELS[m.type] ?? ''),
  }))
}

function waitForContact(input: NodeInput, timeoutMs: number, lastHandledInboundAt: string | null, output?: unknown): NodeResult {
  const previous = typeof input.run.state.timeoutAt === 'string' ? input.run.state.timeoutAt : null
  const timeoutAt = output === undefined && previous ? previous : new Date(input.now.getTime() + timeoutMs).toISOString()
  const state: RunState = { awaitingReply: true, debounceReplies: true, timeoutAt, lastHandledInboundAt }
  return { wait: { resumeAt: new Date(timeoutAt), state }, output }
}

async function send(ctx: AppContext, input: NodeInput, text: string, aiAgentId: string): Promise<string | null> {
  const message = await sendAutomated(ctx, input.run.conversationId, { text }, { flowRunId: input.run.id, aiAgentId })
  return message.status === 'failed' ? (message.error ?? 'Não foi possível enviar a resposta do agente.') : null
}

/** Asks the model, then acts on its answer: tool call or plain reply. */
async function reply(ctx: AppContext, input: NodeInput, agent: NonNullable<Awaited<ReturnType<typeof findAgent>>>, timeoutMs: number, inboundAt: string) {
  const { vendor, apiKey } = await resolveCredentials(ctx, agent.providerId)
  let result
  try {
    result = await ctx.ai[vendor].generate({
      apiKey,
      model: agent.model,
      system: `${agent.instructions}${CHANNEL_RULES}`,
      turns: await historyTurns(ctx, input.run.conversationId, agent.historySize),
      tools: AGENT_TOOLS,
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    })
  } catch (error) {
    return { handOff: { reason: AGENT_FAILED_REASON }, error: error instanceof Error ? error.message : String(error) } satisfies NodeResult
  }

  const sendError = result.text ? await send(ctx, input, result.text, agent.id) : null
  if (sendError) return { handOff: { reason: AGENT_FAILED_REASON }, error: sendError, output: result } satisfies NodeResult
  const handoff = result.toolCalls.find((c) => c.name === HANDOFF_TOOL)
  if (handoff) {
    const reason = typeof handoff.args.motivo === 'string' && handoff.args.motivo.trim() ? handoff.args.motivo : AGENT_HANDOFF_REASON
    const summary = typeof handoff.args.resumo === 'string' ? handoff.args.resumo : null
    return { handOff: { reason, summary }, output: result } satisfies NodeResult
  }
  if (result.toolCalls.some((c) => c.name === FINISH_TOOL)) return { next: 'completed', output: result } satisfies NodeResult
  if (!result.text) return { handOff: { reason: AGENT_FAILED_REASON }, error: 'O agente não gerou resposta.', output: result } satisfies NodeResult
  return waitForContact(input, timeoutMs, inboundAt, result)
}

export const aiAgent: NodeExecutor<'ai_agent'> = async (ctx, node, input) => {
  const agent = await findAgent(ctx, node.config.agentId)
  if (!agent?.isActive) return { next: 'unavailable' }

  const timeoutMs = durationMs(node.config.inactivityTimeout)
  const handled = typeof input.run.state.lastHandledInboundAt === 'string' ? input.run.state.lastHandledInboundAt : null
  const latest = await messageModel.latestInbound(ctx.db, input.run.conversationId)
  const hasUnanswered = latest !== null && (handled === null || latest.sentAt.getTime() > new Date(handled).getTime())

  if (hasUnanswered) return reply(ctx, input, agent, timeoutMs, latest.sentAt.toISOString())
  const timeoutAt = input.run.state.timeoutAt
  if (typeof timeoutAt === 'string' && input.now >= new Date(timeoutAt)) return { next: 'no_reply' }
  return waitForContact(input, timeoutMs, handled)
}
