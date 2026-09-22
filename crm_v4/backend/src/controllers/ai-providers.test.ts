import { beforeEach, describe, expect, it, vi } from 'vitest'
import { aiError } from '../integrations/ai/index.js'
import { decryptSecret } from '../lib/secret-box.js'
import * as agentModel from '../models/ai-agent.js'
import * as providerModel from '../models/ai-provider.js'
import { fakeContext, testConfig } from '../test/context.js'
import * as providers from './ai-providers.js'

vi.mock('../models/ai-provider.js')
vi.mock('../models/ai-agent.js')

const key = Buffer.from(testConfig.AI_CREDENTIALS_KEY, 'base64')
const now = new Date('2026-09-22T12:00:00Z')

type Stored = providerModel.AiProviderWithUsage
function stored(overrides: Partial<Stored> = {}): Stored {
  return {
    id: 'p1',
    name: 'OpenAI',
    vendor: 'openai',
    keyCiphertext: Buffer.alloc(0),
    keyIv: Buffer.alloc(12),
    keyAuthTag: Buffer.alloc(16),
    keyHint: '…1234',
    availableModels: ['gpt-5'],
    lastTestStatus: 'ok',
    lastTestedAt: now,
    createdAt: now,
    updatedAt: now,
    agentCount: 0,
    ...overrides,
  }
}

let fakes: ReturnType<typeof fakeContext>

beforeEach(() => {
  vi.resetAllMocks()
  fakes = fakeContext()
})

describe('ai providers controller', () => {
  it('tests the connection first, then stores the key encrypted with only a hint exposed', async () => {
    fakes.ai.openai.listModels.mockResolvedValue(['gpt-5', 'gpt-4.1'])
    vi.mocked(providerModel.create).mockImplementation(async (_db, input) => stored({ ...input }))

    const dto = await providers.create(fakes.ctx, { name: 'OpenAI', vendor: 'openai', apiKey: 'sk-live-secret-1234' })

    expect(fakes.ai.openai.listModels).toHaveBeenCalledWith('sk-live-secret-1234', expect.any(AbortSignal))
    const saved = vi.mocked(providerModel.create).mock.calls[0]![1]
    expect(saved).toMatchObject({ keyHint: '…1234', availableModels: ['gpt-5', 'gpt-4.1'] })
    expect(decryptSecret({ ciphertext: saved.keyCiphertext, iv: saved.keyIv, authTag: saved.keyAuthTag }, key)).toBe('sk-live-secret-1234')
    expect(JSON.stringify(dto)).not.toContain('sk-live-secret')
    expect(dto).toMatchObject({ keyHint: '…1234', availableModels: ['gpt-5', 'gpt-4.1'] })
  })

  it('saves nothing when the connection test fails', async () => {
    fakes.ai.anthropic.listModels.mockRejectedValue(aiError('chave inválida ou sem permissão'))
    await expect(providers.create(fakes.ctx, { name: 'A', vendor: 'anthropic', apiKey: 'bad-key-123' })).rejects.toMatchObject({
      code: 'AI_PROVIDER_TEST_FAILED',
      httpStatus: 422,
      message: 'Não foi possível conectar ao provedor: O provedor de IA não respondeu corretamente (chave inválida ou sem permissão).',
    })
    expect(providerModel.create).not.toHaveBeenCalled()
  })

  it('re-tests when the key changes, and only renames otherwise', async () => {
    vi.mocked(providerModel.findById).mockResolvedValue(stored())
    vi.mocked(providerModel.update).mockResolvedValue(stored())
    await providers.update(fakes.ctx, 'p1', { name: 'Novo nome' })
    expect(fakes.ai.openai.listModels).not.toHaveBeenCalled()
    expect(providerModel.update).toHaveBeenLastCalledWith(fakes.ctx.db, 'p1', { name: 'Novo nome' })

    fakes.ai.openai.listModels.mockResolvedValue(['gpt-5'])
    await providers.update(fakes.ctx, 'p1', { apiKey: 'sk-new-key-9999' })
    expect(providerModel.update).toHaveBeenLastCalledWith(
      fakes.ctx.db,
      'p1',
      expect.objectContaining({ keyHint: '…9999', availableModels: ['gpt-5'], tested: true }),
    )
  })

  it('round-trips credentials and re-tests with the stored key', async () => {
    fakes.ai.gemini.listModels.mockResolvedValue(['gemini-2.5-flash'])
    vi.mocked(providerModel.create).mockImplementation(async (_db, input) => stored({ ...input }))
    await providers.create(fakes.ctx, { name: 'G', vendor: 'gemini', apiKey: 'gm-key-abcdef' })
    const saved = vi.mocked(providerModel.create).mock.calls[0]![1]
    vi.mocked(providerModel.findById).mockResolvedValue(stored({ ...saved }))
    vi.mocked(providerModel.update).mockResolvedValue(stored({ ...saved }))

    expect(await providers.resolveCredentials(fakes.ctx, 'p1')).toEqual({ vendor: 'gemini', apiKey: 'gm-key-abcdef' })
    await providers.retest(fakes.ctx, 'p1')
    expect(fakes.ai.gemini.listModels).toHaveBeenLastCalledWith('gm-key-abcdef', expect.any(AbortSignal))
  })

  it('refuses to remove a provider used by agents, naming them', async () => {
    vi.mocked(providerModel.findById).mockResolvedValue(stored())
    vi.mocked(agentModel.listByProvider).mockResolvedValue([
      { id: 'a1', name: 'Qualificação' },
      { id: 'a2', name: 'Suporte' },
    ])
    await expect(providers.remove(fakes.ctx, 'p1')).rejects.toMatchObject({
      code: 'PROVIDER_IN_USE',
      message: 'Este provedor é usado pelos agentes: Qualificação, Suporte.',
    })
    expect(providerModel.remove).not.toHaveBeenCalled()
  })

  it('removes an unused provider and 404s unknown ones', async () => {
    vi.mocked(providerModel.findById).mockResolvedValueOnce(stored()).mockResolvedValueOnce(null)
    vi.mocked(agentModel.listByProvider).mockResolvedValue([])
    await providers.remove(fakes.ctx, 'p1')
    expect(providerModel.remove).toHaveBeenCalledWith(fakes.ctx.db, 'p1')
    await expect(providers.remove(fakes.ctx, 'nope')).rejects.toMatchObject({ httpStatus: 404 })
  })
})
