import { beforeEach, describe, expect, it } from 'vitest'
import type { App } from '../app.js'
import type { Db } from '../db/client.js'
import { pipelines, pipelineStages } from '../db/schema.js'
import * as pipelineModel from '../models/pipeline.js'
import type { PipelineWithStages } from '../models/pipeline.js'
import { buildTestApp, cookieFor } from '../test/app.js'
import { createTestDb, insertLead } from '../test/db.js'

let app: App
let db: Db
let cookie: string
let vendas: PipelineWithStages

const stage = (name: string) => vendas.stages.find((s) => s.name === name)!
const get = (url: string) => app.inject({ url, headers: { cookie } })
const post = (url: string, payload: Record<string, unknown>) => app.inject({ method: 'POST', url, headers: { cookie }, payload })

beforeEach(async () => {
  db = await createTestDb()
  app = (await buildTestApp({ db })).app
  cookie = (await cookieFor(db, { name: 'Bia', role: 'attendant' })).cookie
  vendas = (await pipelineModel.findEntry(db))!
})

describe('board routes (US1)', () => {
  it('returns the board with summaries and pages a stage', async () => {
    for (let i = 0; i < 3; i++) {
      await insertLead(db, { pipelineId: vendas.id, stageId: stage('Novo').id, position: i * 1024, valueCents: 100 })
    }

    const board = await get(`/api/pipelines/${vendas.id}/board`)
    expect(board.statusCode).toBe(200)
    const novo = board.json().stages[0]
    expect(novo).toMatchObject({ name: 'Novo', leadCount: 3, valueTotalCents: 300, nextCursor: null })
    expect(novo.leads[0]).toMatchObject({ pipelineId: vendas.id, stageId: stage('Novo').id, contact: { name: expect.any(String) } })

    const page1 = (await get(`/api/pipelines/${vendas.id}/stages/${stage('Novo').id}/leads?limit=2`)).json()
    expect(page1.items).toHaveLength(2)
    const page2 = (await get(`/api/pipelines/${vendas.id}/stages/${stage('Novo').id}/leads?limit=2&cursor=${page1.nextCursor}`)).json()
    expect(page2).toMatchObject({ items: [expect.any(Object)], nextCursor: null })
  })

  it('lets any user move a lead and persists it', async () => {
    const { lead } = await insertLead(db, { pipelineId: vendas.id, stageId: stage('Novo').id })

    const moved = await post(`/api/leads/${lead.id}/move`, { stageId: stage('Em contato').id, beforeLeadId: null })
    expect(moved.statusCode).toBe(200)
    expect(moved.json()).toMatchObject({ id: lead.id, stageId: stage('Em contato').id })

    const board = (await get(`/api/pipelines/${vendas.id}/board`)).json()
    expect(board.stages[1].leads.map((l: { id: string }) => l.id)).toEqual([lead.id])
  })

  it('validates input and requires a session', async () => {
    const { lead } = await insertLead(db, { pipelineId: vendas.id, stageId: stage('Novo').id })
    expect((await post(`/api/leads/${lead.id}/move`, { stageId: stage('Perdido').id })).json()).toMatchObject({
      code: 'LOST_REASON_REQUIRED',
    })
    expect((await post('/api/leads/nao-e-uuid/move', { stageId: stage('Novo').id })).statusCode).toBe(422)
    expect((await get(`/api/pipelines/${vendas.id}/board?assignee=alguem`)).statusCode).toBe(422)
    expect((await app.inject({ url: `/api/pipelines/${vendas.id}/board` })).statusCode).toBe(401)
  })
})

describe('contact lead routes (US2)', () => {
  it('creates a lead for a contact, refuses a duplicate and lists the contact leads', async () => {
    const { lead, contact } = await insertLead(db, { pipelineId: vendas.id, stageId: stage('Novo').id })
    const [other] = await db.insert(pipelines).values({ name: 'Pós-venda' }).returning()
    await db.insert(pipelineStages).values({ pipelineId: other!.id, name: 'Onboarding', position: 0 })

    const created = await post('/api/leads', { pipelineId: other!.id, contactId: contact.id })
    expect(created.statusCode).toBe(201)
    expect(created.json()).toMatchObject({ pipelineId: other!.id, contact: { id: contact.id } })

    const duplicate = await post('/api/leads', { pipelineId: vendas.id, contactId: contact.id })
    expect(duplicate.statusCode).toBe(409)
    expect(duplicate.json().code).toBe('LEAD_EXISTS')

    const list = (await get(`/api/leads?contactId=${contact.id}`)).json()
    expect(list.map((l: { id: string }) => l.id)).toContain(lead.id)
    expect(list).toHaveLength(2)
  })

  it('requires contactId', async () => {
    expect((await get('/api/leads')).statusCode).toBe(422)
  })
})

describe('lead detail routes and filters (US4)', () => {
  it('reads, edits and deletes a lead', async () => {
    const { lead } = await insertLead(db, { pipelineId: vendas.id, stageId: stage('Novo').id })
    const bia = (await get('/api/users/assignable')).json()[0]

    const patched = await app.inject({
      method: 'PATCH',
      url: `/api/leads/${lead.id}`,
      headers: { cookie },
      payload: { valueCents: 500000, assigneeId: bia.id, notes: 'Ligar amanhã', title: '  ' },
    })
    expect(patched.statusCode).toBe(200)
    expect(patched.json()).toMatchObject({ valueCents: 500000, assignee: { name: 'Bia' }, title: null })

    await post(`/api/leads/${lead.id}/move`, { stageId: stage('Em contato').id })
    const detail = (await get(`/api/leads/${lead.id}`)).json()
    expect(detail).toMatchObject({ notes: 'Ligar amanhã' })
    expect(detail.history[0]).toMatchObject({ fromStageName: 'Novo', toStageName: 'Em contato', changedBy: { name: 'Bia' } })

    expect((await app.inject({ method: 'DELETE', url: `/api/leads/${lead.id}`, headers: { cookie } })).statusCode).toBe(204)
    expect((await get(`/api/leads/${lead.id}`)).statusCode).toBe(404)
  })

  it('validates edits', async () => {
    const { lead } = await insertLead(db, { pipelineId: vendas.id, stageId: stage('Novo').id })
    const patch = (payload: Record<string, unknown>) => app.inject({ method: 'PATCH', url: `/api/leads/${lead.id}`, headers: { cookie }, payload })
    expect((await patch({ valueCents: -1 })).statusCode).toBe(422)
    expect((await patch({ valueCents: 10.5 })).statusCode).toBe(422)
    expect((await patch({ notes: 'x'.repeat(5001) })).statusCode).toBe(422)
    expect((await patch({})).statusCode).toBe(422)
    expect((await patch({ assigneeId: '00000000-0000-0000-0000-000000000000' })).json().code).toBe('ASSIGNEE_INVALID')
  })

  it('filters the board by "me" and by search, counts included', async () => {
    const mine = await insertLead(db, { pipelineId: vendas.id, stageId: stage('Novo').id, name: 'Carla Mendes', valueCents: 100 })
    await insertLead(db, { pipelineId: vendas.id, stageId: stage('Novo').id, name: 'Rafael Costa', position: 1024, valueCents: 200 })
    const me = (await get('/api/users/assignable')).json()[0]
    await app.inject({ method: 'PATCH', url: `/api/leads/${mine.lead.id}`, headers: { cookie }, payload: { assigneeId: me.id } })

    const own = (await get(`/api/pipelines/${vendas.id}/board?assignee=me`)).json().stages[0]
    expect(own).toMatchObject({ leadCount: 1, valueTotalCents: 100 })
    const searched = (await get(`/api/pipelines/${vendas.id}/board?search=rafael`)).json().stages[0]
    expect(searched.leads.map((l: { contact: { name: string } }) => l.contact.name)).toEqual(['Rafael Costa'])
    const unassigned = (await get(`/api/pipelines/${vendas.id}/board?assignee=none`)).json().stages[0]
    expect(unassigned.leadCount).toBe(1)
  })
})
