import type { AppContext } from '../context.js'
import { conflict, DomainError, notFound } from '../lib/errors.js'
import * as agentModel from '../models/ai-agent.js'
import * as providerModel from '../models/ai-provider.js'
import * as flowModel from '../models/flow.js'
import type { User } from '../models/user.js'
import { toAiAgentDto } from './automation-dto.js'

export interface AgentInput {
  name: string
  providerId: string
  model: string
  instructions: string
  historySize: number
}

/** The model must come from the provider's last connection test. */
async function assertModelAvailable(ctx: AppContext, providerId: string, model: string) {
  const provider = await providerModel.findById(ctx.db, providerId)
  if (!provider) throw notFound('Provedor de IA não encontrado.')
  if (!provider.availableModels.includes(model)) {
    throw new DomainError('VALIDATION_ERROR', 'Escolha um modelo da lista do provedor.', 422)
  }
}

/** Row with provider, for the agent block. Null when the agent was deleted. */
export const findAgent = (ctx: AppContext, id: string) => agentModel.findById(ctx.db, id)

/** Lookup for graph activation checks (FR-006). */
export async function findAgentForValidation(ctx: AppContext, id: string): Promise<{ isActive: boolean } | null> {
  const agent = await agentModel.findById(ctx.db, id)
  return agent ? { isActive: agent.isActive } : null
}

async function load(ctx: AppContext, id: string) {
  const agent = await agentModel.findById(ctx.db, id)
  if (!agent) throw notFound('Agente não encontrado.')
  return agent
}

export async function list(ctx: AppContext) {
  return (await agentModel.list(ctx.db)).map(toAiAgentDto)
}

export async function create(ctx: AppContext, user: User, input: AgentInput) {
  await assertModelAvailable(ctx, input.providerId, input.model)
  return toAiAgentDto(await agentModel.create(ctx.db, { ...input, createdByUserId: user.id }))
}

export async function update(ctx: AppContext, id: string, patch: Partial<AgentInput> & { isActive?: boolean }) {
  const agent = await load(ctx, id)
  if (patch.providerId !== undefined || patch.model !== undefined) {
    await assertModelAvailable(ctx, patch.providerId ?? agent.providerId, patch.model ?? agent.model)
  }
  return toAiAgentDto((await agentModel.update(ctx.db, id, patch))!)
}

export async function remove(ctx: AppContext, id: string) {
  await load(ctx, id)
  const flows = await flowModel.findActiveReferencingAgent(ctx.db, id)
  if (flows.length > 0) {
    throw conflict('AGENT_IN_USE', `Este agente é usado pelos fluxos ativos: ${flows.map((f) => f.name).join(', ')}.`)
  }
  await agentModel.remove(ctx.db, id)
}
