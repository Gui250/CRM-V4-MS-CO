import { beforeEach, describe, expect, it } from 'vitest'
import type { App } from '../app.js'
import type { Db } from '../db/client.js'
import { aiError } from '../integrations/ai/index.js'
import { buildTestApp, cookieFor } from '../test/app.js'
import { createTestDb } from '../test/db.js'

const API_KEY = 'sk-live-very-secret-9876'

let app: App
let db: Db
let ai: Awaited<ReturnType<typeof buildTestApp>>['ai']
let admin: string
let attendant: string

beforeEach(async () => {
  db = await createTestDb()
  ;({ app, ai } = await buildTestApp({ db }))
  admin = (await cookieFor(db, { name: 'Admin', role: 'admin' })).cookie
  attendant = (await cookieFor(db, { name: 'Bia', role: 'attendant' })).cookie
  ai.openai.listModels.mockResolvedValue(['gpt-4.1', 'gpt-5'])
})

const createProvider = () =>
  app.inject({ method: 'POST', url: '/api/ai-providers', headers: { cookie: admin }, payload: { name: 'OpenAI', vendor: 'openai', apiKey: API_KEY } })

const createAgent = (providerId: string, model = 'gpt-5') =>
  app.inject({
    method: 'POST',
    url: '/api/ai-agents',
    headers: { cookie: admin },
    payload: { name: 'Qualificação', providerId, model, instructions: 'Qualifique o lead.' },
  })

describe('AI provider and agent routes', () => {
  it('require a session and an admin', async () => {
    for (const url of ['/api/ai-providers', '/api/ai-agents']) {
      expect((await app.inject({ url })).statusCode).toBe(401)
      expect((await app.inject({ url, headers: { cookie: attendant } })).statusCode).toBe(403)
    }
  })

  it('creates a provider after a connection test and never returns the key', async () => {
    const created = await createProvider()
    expect(created.statusCode).toBe(201)
    expect(created.json()).toMatchObject({ name: 'OpenAI', vendor: 'openai', keyHint: '…9876', availableModels: ['gpt-4.1', 'gpt-5'], agentCount: 0 })

    const listed = await app.inject({ url: '/api/ai-providers', headers: { cookie: admin } })
    const retested = await app.inject({ method: 'POST', url: `/api/ai-providers/${created.json().id}/test`, headers: { cookie: admin } })
    for (const response of [created, listed, retested]) expect(response.body).not.toContain(API_KEY)
    expect(ai.openai.listModels).toHaveBeenLastCalledWith(API_KEY, expect.any(AbortSignal))
  })

  it('answers 422 when the connection test fails, without leaking the key', async () => {
    ai.openai.listModels.mockRejectedValue(aiError('chave inválida ou sem permissão'))
    const response = await createProvider()
    expect(response.statusCode).toBe(422)
    expect(response.json().code).toBe('AI_PROVIDER_TEST_FAILED')
    expect(response.body).not.toContain(API_KEY)
  })

  it('validates bodies', async () => {
    const bad = await app.inject({ method: 'POST', url: '/api/ai-providers', headers: { cookie: admin }, payload: { name: 'X', vendor: 'openai', apiKey: 'short' } })
    expect(bad.statusCode).toBe(422)
    const emptyPatch = await app.inject({ method: 'PATCH', url: `/api/ai-agents/${crypto.randomUUID()}`, headers: { cookie: admin }, payload: {} })
    expect(emptyPatch.statusCode).toBe(422)
  })

  it('creates, toggles and deletes agents; blocks deleting a provider in use', async () => {
    const providerId = (await createProvider()).json().id
    expect((await createAgent(providerId, 'gpt-1')).statusCode).toBe(422)

    const created = await createAgent(providerId)
    expect(created.statusCode).toBe(201)
    expect(created.json()).toMatchObject({ name: 'Qualificação', historySize: 20, isActive: true, provider: { id: providerId, vendor: 'openai' } })

    const toggled = await app.inject({ method: 'PATCH', url: `/api/ai-agents/${created.json().id}`, headers: { cookie: admin }, payload: { isActive: false } })
    expect(toggled.json()).toMatchObject({ isActive: false })

    const blocked = await app.inject({ method: 'DELETE', url: `/api/ai-providers/${providerId}`, headers: { cookie: admin } })
    expect(blocked.statusCode).toBe(409)
    expect(blocked.json()).toEqual({ code: 'PROVIDER_IN_USE', message: 'Este provedor é usado pelos agentes: Qualificação.' })

    expect((await app.inject({ method: 'DELETE', url: `/api/ai-agents/${created.json().id}`, headers: { cookie: admin } })).statusCode).toBe(204)
    expect((await app.inject({ method: 'DELETE', url: `/api/ai-providers/${providerId}`, headers: { cookie: admin } })).statusCode).toBe(204)
  })
})
