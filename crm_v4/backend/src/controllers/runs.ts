import type { AppContext } from '../context.js'
import { conflict, DomainError, notFound } from '../lib/errors.js'
import * as contactModel from '../models/contact.js'
import * as conversationModel from '../models/conversation.js'
import * as flowModel from '../models/flow.js'
import * as runModel from '../models/flow-run.js'
import type { User } from '../models/user.js'
import { toRunDetailDto, toRunSummaryDto } from './automation-dto.js'
import * as engine from './automation/engine.js'
import { isConnected } from './connection.js'
import { toConversationDto } from './dto.js'

// Runs seen from the chat and the history pages (US4, US5).

const PHONE = /^\d{10,15}$/

const notStartable = () => new DomainError('FLOW_NOT_STARTABLE', 'Este fluxo não pode ser disparado manualmente.', 422)

/** Starts any active flow on a conversation by hand (FR-026); the run continues in the background. */
export async function startManual(ctx: AppContext, user: Pick<User, 'id'>, conversationId: string, flowId: string) {
  const flow = await flowModel.findById(ctx.db, flowId)
  if (!flow || flow.status !== 'active') throw notStartable()
  const conversation = await conversationModel.findById(ctx.db, conversationId)
  if (!conversation) throw notFound('Conversa não encontrada.')
  if (conversation.contact.automationOptOutAt) {
    throw conflict('CONTACT_OPTED_OUT', 'Este contato pediu para não receber mensagens automáticas.')
  }
  if (!(await isConnected(ctx))) {
    throw conflict('WHATSAPP_DISCONNECTED', 'O WhatsApp está desconectado. Conecte o número para disparar automações.')
  }
  // Starting a flow by hand puts the conversation back in automation mode.
  if (conversation.handlingMode === 'human') await conversationModel.release(ctx.db, conversationId)

  const { run, done } = await engine.start(ctx, { flow, conversationId, origin: 'manual', userId: user.id })
  done.catch((error: unknown) => ctx.log.error({ err: error, runId: run.id }, 'manual run failed'))
  return toRunSummaryDto(run)
}

/** Opens (or reuses) the conversation with a number and starts the flow there (FR-027). */
export async function startManualForPhone(ctx: AppContext, user: Pick<User, 'id'>, phone: string, flowId: string) {
  if (!PHONE.test(phone)) throw new DomainError('VALIDATION_ERROR', 'Informe o número só com dígitos e DDI, ex. 5511999999999.', 422)
  const flow = await flowModel.findById(ctx.db, flowId)
  if (!flow || flow.status !== 'active') throw notStartable()
  const { exists, jid } = await ctx.evolution.checkWhatsAppNumber(phone)
  if (!exists || !jid) throw new DomainError('PHONE_NOT_ON_WHATSAPP', 'Este número não tem WhatsApp.', 422)

  const { contact } = await contactModel.upsertByJid(ctx.db, { waJid: jid, name: null })
  const { id } = await conversationModel.getOrCreateForContact(ctx.db, contact.id)
  const run = await startManual(ctx, user, id, flowId)
  const conversation = await conversationModel.findById(ctx.db, id)
  return { conversation: toConversationDto(conversation!), run }
}

/** "Parar" in the chat (US4-2). */
export async function cancel(ctx: AppContext, runId: string) {
  const run = await runModel.findById(ctx.db, runId)
  if (!run) throw notFound('Execução não encontrada.')
  const cancelled = await engine.cancel(ctx, runId, 'stopped_by_user')
  if (!cancelled) throw conflict('RUN_FINISHED', 'Esta automação já terminou.')
  return toRunSummaryDto(cancelled)
}

export async function listForConversation(ctx: AppContext, conversationId: string) {
  return (await runModel.listByConversation(ctx.db, conversationId)).map(toRunSummaryDto)
}

export async function listByFlow(
  ctx: AppContext,
  flowId: string,
  query: { status?: runModel.RunStatus; cursor?: string; limit: number },
) {
  if (!(await flowModel.findById(ctx.db, flowId))) throw notFound('Fluxo não encontrado.')
  const page = await runModel.listByFlow(ctx.db, flowId, query)
  return { items: page.items.map(toRunSummaryDto), nextCursor: page.nextCursor }
}

export async function getDetail(ctx: AppContext, runId: string) {
  const run = await runModel.findDetail(ctx.db, runId)
  if (!run) throw notFound('Execução não encontrada.')
  return toRunDetailDto(run)
}
