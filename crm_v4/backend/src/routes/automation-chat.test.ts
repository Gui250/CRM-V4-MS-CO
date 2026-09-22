import { beforeEach, describe, expect, it } from 'vitest'
import type { App } from '../app.js'
import type { Db } from '../db/client.js'
import * as connectionModel from '../models/connection.js'
import * as contactModel from '../models/contact.js'
import * as conversationModel from '../models/conversation.js'
import * as flowModel from '../models/flow.js'
import { buildTestApp, cookieFor } from '../test/app.js'
import { testConfig } from '../test/context.js'
import { createTestDb } from '../test/db.js'

// Feature 003 routes used from the chat: hand-off, opt-out, manual flows and runs.

let app: App
let db: Db
let evolution: Awaited<ReturnType<typeof buildTestApp>>['evolution']
let admin: string
let attendant: string
let adminId: string
let conversationId: string
let contactId: string
let flowId: string

const pos = { x: 0, y: 0 }
const manualGraph = {
  nodes: [
    { id: 't', type: 'trigger.manual', position: pos, config: {} },
    { id: 'w', type: 'wait', position: pos, config: { amount: 1, unit: 'days' } },
  ],
  edges: [{ id: 'e', source: 't', sourceHandle: 'next', target: 'w' }],
}

beforeEach(async () => {
  db = await createTestDb()
  ;({ app, evolution } = await buildTestApp({ db }))
  const adminUser = await cookieFor(db, { name: 'Admin', role: 'admin' })
  admin = adminUser.cookie
  adminId = adminUser.user.id
  attendant = (await cookieFor(db, { name: 'Bia', role: 'attendant' })).cookie
  await connectionModel.update(db, testConfig.EVOLUTION_INSTANCE, { status: 'connected' })
  const { contact } = await contactModel.upsertByJid(db, { waJid: '5511999999999@s.whatsapp.net', name: 'Ana' })
  contactId = contact.id
  conversationId = (await conversationModel.getOrCreateForContact(db, contact.id)).id
  const flow = await flowModel.create(db, { name: 'Follow-up', description: null, userId: adminId })
  await flowModel.saveVersion(db, { flowId: flow.id, graph: manualGraph, triggerType: 'manual', userId: adminId })
  await flowModel.setStatus(db, flow.id, 'active', adminId)
  flowId = flow.id
})

const as = (cookie: string) => ({ cookie })
const startFlow = () =>
  app.inject({ method: 'POST', url: `/api/conversations/${conversationId}/start-flow`, headers: as(attendant), payload: { flowId } })

describe('chat automation routes', () => {
  it('require a session', async () => {
    const calls = [
      { method: 'POST' as const, url: `/api/conversations/${conversationId}/assume` },
      { method: 'GET' as const, url: `/api/conversations/${conversationId}/runs` },
      { method: 'PUT' as const, url: `/api/contacts/${contactId}/automation-opt-out` },
      // Body validation runs before the auth hook, so this one carries a valid payload.
      { method: 'POST' as const, url: '/api/conversations/start-flow', payload: { phone: '5511999999999', flowId } },
    ]
    for (const call of calls) expect((await app.inject(call)).statusCode).toBe(401)
  })

  it('lets an attendant assume and release, and filters conversations awaiting a human', async () => {
    await conversationModel.handOff(db, conversationId, { reason: 'Pediu uma pessoa', summary: null })
    const awaiting = await app.inject({ url: '/api/conversations?handling=awaiting_human', headers: as(attendant) })
    expect(awaiting.json().items.map((c: { id: string }) => c.id)).toEqual([conversationId])

    const assumed = await app.inject({ method: 'POST', url: `/api/conversations/${conversationId}/assume`, headers: as(attendant) })
    expect(assumed.statusCode).toBe(200)
    expect(assumed.json().handling).toMatchObject({ mode: 'human', reason: 'Pediu uma pessoa', assumedBy: { name: 'Bia' } })
    expect((await app.inject({ url: '/api/conversations?handling=awaiting_human', headers: as(attendant) })).json().items).toEqual([])

    const released = await app.inject({ method: 'POST', url: `/api/conversations/${conversationId}/release`, headers: as(attendant) })
    expect(released.json().handling).toMatchObject({ mode: 'automation', assumedBy: null })
  })

  it('marks and clears "não automatizar"', async () => {
    const marked = await app.inject({ method: 'PUT', url: `/api/contacts/${contactId}/automation-opt-out`, headers: as(attendant) })
    expect(marked.json()).toMatchObject({ id: conversationId, automationOptOut: true })
    expect((await startFlow()).json()).toMatchObject({ code: 'CONTACT_OPTED_OUT' })
    const cleared = await app.inject({ method: 'DELETE', url: `/api/contacts/${contactId}/automation-opt-out`, headers: as(attendant) })
    expect(cleared.json()).toMatchObject({ automationOptOut: false })
  })

  it('starts a manual flow once, lists it and stops it', async () => {
    const started = await startFlow()
    expect(started.statusCode).toBe(201)
    expect(started.json()).toMatchObject({ flowName: 'Follow-up', origin: 'manual', conversationId })
    const again = await startFlow()
    expect(again.statusCode).toBe(409)
    expect(again.json().code).toBe('RUN_ALREADY_ACTIVE')

    const runs = await app.inject({ url: `/api/conversations/${conversationId}/runs`, headers: as(attendant) })
    expect(runs.json().map((r: { id: string }) => r.id)).toEqual([started.json().id])
    const detail = await app.inject({ url: `/api/runs/${started.json().id}`, headers: as(attendant) })
    expect(detail.json()).toMatchObject({ id: started.json().id, graph: manualGraph, steps: expect.any(Array) })

    const cancel = () => app.inject({ method: 'POST', url: `/api/runs/${started.json().id}/cancel`, headers: as(attendant) })
    expect((await cancel()).json()).toMatchObject({ status: 'cancelled', endReason: 'stopped_by_user' })
    expect((await cancel()).statusCode).toBe(409)
  })

  it('starts a flow on a new number after checking it has WhatsApp', async () => {
    evolution.checkWhatsAppNumber.mockResolvedValue({ exists: true, jid: '5521988887777@s.whatsapp.net' })
    const started = await app.inject({
      method: 'POST',
      url: '/api/conversations/start-flow',
      headers: as(attendant),
      payload: { phone: '5521988887777', flowId },
    })
    expect(started.statusCode).toBe(201)
    expect(started.json()).toMatchObject({ conversation: { contact: { phone: '5521988887777' } }, run: { flowName: 'Follow-up' } })

    evolution.checkWhatsAppNumber.mockResolvedValue({ exists: false, jid: null })
    const missing = await app.inject({
      method: 'POST',
      url: '/api/conversations/start-flow',
      headers: as(attendant),
      payload: { phone: '5521911112222', flowId },
    })
    expect(missing.statusCode).toBe(422)
    expect(missing.json().code).toBe('PHONE_NOT_ON_WHATSAPP')
  })

  it('keeps the flow history admin-only', async () => {
    await startFlow()
    expect((await app.inject({ url: `/api/flows/${flowId}/runs`, headers: as(attendant) })).statusCode).toBe(403)
    const history = await app.inject({ url: `/api/flows/${flowId}/runs?limit=10`, headers: as(admin) })
    expect(history.json()).toMatchObject({ items: [{ flowId, isTest: false }], nextCursor: null })
  })
})
