import { beforeEach, describe, expect, it } from 'vitest'
import type { Db } from '../db/client.js'
import { createTestDb } from '../test/db.js'
import * as agentModel from './ai-agent.js'
import * as providerModel from './ai-provider.js'
import * as userModel from './user.js'

let db: Db
let userId: string

beforeEach(async () => {
  db = await createTestDb()
  userId = (await userModel.create(db, { name: 'Admin', email: 'a@v4.test', passwordHash: 'x', role: 'admin', status: 'active' })).id
})

const sealed = { keyCiphertext: Buffer.from('c'), keyIv: Buffer.alloc(12, 1), keyAuthTag: Buffer.alloc(16, 2), keyHint: '…abcd' }
const createProvider = (name = 'OpenAI produção') =>
  providerModel.create(db, { name, vendor: 'openai', availableModels: ['gpt-5', 'gpt-4.1'], ...sealed })
const createAgent = (providerId: string, name = 'Qualificação', historySize = 20) =>
  agentModel.create(db, { name, providerId, model: 'gpt-5', instructions: 'Qualifique o lead.', historySize, createdByUserId: userId })

describe('ai provider model', () => {
  it('creates a tested provider keeping the sealed key as bytes', async () => {
    const provider = await createProvider()
    expect(provider).toMatchObject({ vendor: 'openai', keyHint: '…abcd', availableModels: ['gpt-5', 'gpt-4.1'], lastTestStatus: 'ok', agentCount: 0 })
    expect(Buffer.from(provider.keyIv).equals(sealed.keyIv)).toBe(true)
    expect(provider.lastTestedAt).toBeInstanceOf(Date)
  })

  it('rejects duplicated names', async () => {
    await createProvider()
    await expect(createProvider()).rejects.toMatchObject({ code: 'PROVIDER_NAME_TAKEN', httpStatus: 409 })
  })

  it('lists with the number of agents using each provider', async () => {
    const a = await createProvider('A')
    await createProvider('B')
    await createAgent(a.id, 'X')
    await createAgent(a.id, 'Y')
    expect((await providerModel.list(db)).map((p) => [p.name, p.agentCount])).toEqual([
      ['A', 2],
      ['B', 0],
    ])
  })

  it('updates name, key and models, refreshing the test time only when tested', async () => {
    const provider = await createProvider()
    const renamed = await providerModel.update(db, provider.id, { name: 'Novo' })
    expect(renamed).toMatchObject({ name: 'Novo', lastTestedAt: provider.lastTestedAt })
    const retested = await providerModel.update(db, provider.id, { keyHint: '…wxyz', availableModels: ['gpt-5'], tested: true })
    expect(retested).toMatchObject({ keyHint: '…wxyz', availableModels: ['gpt-5'] })
    expect(retested!.lastTestedAt.getTime()).toBeGreaterThanOrEqual(provider.lastTestedAt.getTime())
  })

  it('cannot remove a provider that agents use', async () => {
    const provider = await createProvider()
    await createAgent(provider.id)
    await expect(providerModel.remove(db, provider.id)).rejects.toThrow()
    expect(await providerModel.findById(db, provider.id)).not.toBeNull()
  })
})

describe('ai agent model', () => {
  it('creates an active agent with its provider', async () => {
    const provider = await createProvider()
    expect(await createAgent(provider.id)).toMatchObject({
      name: 'Qualificação',
      model: 'gpt-5',
      historySize: 20,
      isActive: true,
      provider: { id: provider.id, name: 'OpenAI produção', vendor: 'openai' },
    })
  })

  it('rejects duplicated names and history outside 5–50', async () => {
    const provider = await createProvider()
    await createAgent(provider.id)
    await expect(createAgent(provider.id)).rejects.toMatchObject({ code: 'AGENT_NAME_TAKEN', httpStatus: 409 })
    await expect(createAgent(provider.id, 'Curto', 4)).rejects.toThrow()
    await expect(createAgent(provider.id, 'Longo', 51)).rejects.toThrow()
  })

  it('updates, toggles, lists by provider and removes', async () => {
    const provider = await createProvider()
    const other = await createProvider('Outro')
    const agent = await createAgent(provider.id)
    await createAgent(other.id, 'Suporte')
    expect(await agentModel.update(db, agent.id, { isActive: false, model: 'gpt-4.1' })).toMatchObject({ isActive: false, model: 'gpt-4.1' })
    expect(await agentModel.listByProvider(db, provider.id)).toEqual([{ id: agent.id, name: 'Qualificação' }])
    expect((await agentModel.list(db)).map((a) => a.name)).toEqual(['Qualificação', 'Suporte'])
    await agentModel.remove(db, agent.id)
    expect(await agentModel.findById(db, agent.id)).toBeNull()
  })
})
