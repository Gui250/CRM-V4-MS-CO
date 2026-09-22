import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as agentModel from '../models/ai-agent.js'
import * as providerModel from '../models/ai-provider.js'
import * as flowModel from '../models/flow.js'
import type { User } from '../models/user.js'
import { fakeContext } from '../test/context.js'
import * as agents from './ai-agents.js'

vi.mock('../models/ai-agent.js')
vi.mock('../models/ai-provider.js')
vi.mock('../models/flow.js')

const now = new Date('2026-09-22T12:00:00Z')
const admin: User = { id: 'u1', name: 'Admin', email: 'a@x.com', role: 'admin', status: 'active', createdAt: now, updatedAt: now }
const input = { name: 'Qualificação', providerId: 'p1', model: 'gpt-5', instructions: 'Qualifique.', historySize: 20 }

const provider = { availableModels: ['gpt-5', 'gpt-4.1'] } as providerModel.AiProviderWithUsage
const agent = (overrides: Partial<agentModel.AiAgentWithProvider> = {}): agentModel.AiAgentWithProvider => ({
  id: 'a1',
  ...input,
  isActive: true,
  createdByUserId: 'u1',
  createdAt: now,
  updatedAt: now,
  provider: { id: 'p1', name: 'OpenAI', vendor: 'openai' },
  ...overrides,
})

let fakes: ReturnType<typeof fakeContext>

beforeEach(() => {
  vi.resetAllMocks()
  fakes = fakeContext()
})

describe('ai agents controller', () => {
  it('creates an agent when the model is available at the provider', async () => {
    vi.mocked(providerModel.findById).mockResolvedValue(provider)
    vi.mocked(agentModel.create).mockResolvedValue(agent())
    const dto = await agents.create(fakes.ctx, admin, input)
    expect(agentModel.create).toHaveBeenCalledWith(fakes.ctx.db, { ...input, createdByUserId: 'u1' })
    expect(dto).toMatchObject({ id: 'a1', provider: { vendor: 'openai' }, isActive: true, updatedAt: now.toISOString() })
  })

  it('rejects models outside the provider list and unknown providers', async () => {
    vi.mocked(providerModel.findById).mockResolvedValueOnce(provider).mockResolvedValueOnce(null)
    await expect(agents.create(fakes.ctx, admin, { ...input, model: 'gpt-1' })).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      httpStatus: 422,
      message: 'Escolha um modelo da lista do provedor.',
    })
    await expect(agents.create(fakes.ctx, admin, input)).rejects.toMatchObject({ httpStatus: 404 })
    expect(agentModel.create).not.toHaveBeenCalled()
  })

  it('toggles isActive without re-checking the model', async () => {
    vi.mocked(agentModel.findById).mockResolvedValue(agent())
    vi.mocked(agentModel.update).mockResolvedValue(agent({ isActive: false }))
    expect(await agents.update(fakes.ctx, 'a1', { isActive: false })).toMatchObject({ isActive: false })
    expect(providerModel.findById).not.toHaveBeenCalled()
  })

  it('checks the model against the new provider when switching providers', async () => {
    vi.mocked(agentModel.findById).mockResolvedValue(agent())
    vi.mocked(providerModel.findById).mockResolvedValue({ availableModels: ['claude-sonnet-5'] } as providerModel.AiProviderWithUsage)
    await expect(agents.update(fakes.ctx, 'a1', { providerId: 'p2' })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
    expect(providerModel.findById).toHaveBeenCalledWith(fakes.ctx.db, 'p2')
  })

  it('refuses to remove an agent used by active flows', async () => {
    vi.mocked(agentModel.findById).mockResolvedValue(agent())
    vi.mocked(flowModel.findActiveReferencingAgent).mockResolvedValue([{ id: 'f1', name: 'Atendimento' }])
    await expect(agents.remove(fakes.ctx, 'a1')).rejects.toMatchObject({
      code: 'AGENT_IN_USE',
      message: 'Este agente é usado pelos fluxos ativos: Atendimento.',
    })
    vi.mocked(flowModel.findActiveReferencingAgent).mockResolvedValue([])
    await agents.remove(fakes.ctx, 'a1')
    expect(agentModel.remove).toHaveBeenCalledWith(fakes.ctx.db, 'a1')
  })

  it('exposes a validation lookup for graph activation', async () => {
    vi.mocked(agentModel.findById).mockResolvedValueOnce(agent({ isActive: false })).mockResolvedValueOnce(null)
    expect(await agents.findAgentForValidation(fakes.ctx, 'a1')).toEqual({ isActive: false })
    expect(await agents.findAgentForValidation(fakes.ctx, 'x')).toBeNull()
  })
})
