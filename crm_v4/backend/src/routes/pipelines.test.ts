import { beforeEach, describe, expect, it } from 'vitest'
import type { App } from '../app.js'
import type { Db } from '../db/client.js'
import { buildTestApp, cookieFor } from '../test/app.js'
import { createTestDb, insertLead } from '../test/db.js'

let app: App
let db: Db
let attendant: string

beforeEach(async () => {
  db = await createTestDb()
  app = (await buildTestApp({ db })).app
  attendant = (await cookieFor(db, { name: 'Bia', role: 'attendant' })).cookie
})

describe('GET /api/pipelines', () => {
  it('lists pipelines with ordered stages for any user', async () => {
    const response = await app.inject({ url: '/api/pipelines?includeArchived=true', headers: { cookie: attendant } })
    expect(response.statusCode).toBe(200)
    const [vendas] = response.json()
    expect(vendas).toMatchObject({ name: 'Vendas', isEntry: true, archivedAt: null })
    expect(vendas.stages.map((stage: { name: string }) => stage.name)).toEqual([
      'Novo',
      'Em contato',
      'Proposta',
      'Ganho',
      'Perdido',
    ])
  })

  it('requires a session', async () => {
    expect((await app.inject({ url: '/api/pipelines' })).statusCode).toBe(401)
  })
})

describe('pipeline structure routes (US3, admin only)', () => {
  let admin: string
  let vendasId: string
  let stageIds: string[]

  beforeEach(async () => {
    admin = (await cookieFor(db, { name: 'Ana', role: 'admin' })).cookie
    const [vendas] = (await app.inject({ url: '/api/pipelines', headers: { cookie: admin } })).json()
    vendasId = vendas.id
    stageIds = vendas.stages.map((s: { id: string }) => s.id)
  })

  const call = (cookie: string, method: 'POST' | 'PATCH' | 'PUT' | 'DELETE', url: string, payload?: Record<string, unknown>) =>
    app.inject({ method, url, headers: { cookie }, ...(payload ? { payload } : {}) })

  it('refuses every structure change to attendants', async () => {
    const attempts = [
      call(attendant, 'POST', '/api/pipelines', { name: 'Pós-venda' }),
      call(attendant, 'PATCH', `/api/pipelines/${vendasId}`, { name: 'X' }),
      call(attendant, 'POST', `/api/pipelines/${vendasId}/stages`, { name: 'X' }),
      call(attendant, 'PATCH', `/api/pipelines/${vendasId}/stages/${stageIds[0]}`, { name: 'X' }),
      call(attendant, 'PUT', `/api/pipelines/${vendasId}/stages/order`, { stageIds }),
      call(attendant, 'DELETE', `/api/pipelines/${vendasId}/stages/${stageIds[2]}`),
    ]
    for (const response of await Promise.all(attempts)) expect(response.statusCode).toBe(403)
  })

  it('lets an admin build a pipeline: create, add stage, reorder, rename, delete, archive', async () => {
    const created = await call(admin, 'POST', '/api/pipelines', { name: 'Pós-venda' })
    expect(created.statusCode).toBe(201)
    const pipeline = created.json()
    expect(pipeline.stages).toHaveLength(5)

    const stage = await call(admin, 'POST', `/api/pipelines/${pipeline.id}/stages`, { name: 'Onboarding', color: 'teal' })
    expect(stage.statusCode).toBe(201)

    const order = [pipeline.stages[0].id, stage.json().id, ...pipeline.stages.slice(1).map((s: { id: string }) => s.id)]
    const reordered = await call(admin, 'PUT', `/api/pipelines/${pipeline.id}/stages/order`, { stageIds: order })
    expect(reordered.json().map((s: { name: string }) => s.name)).toEqual(['Novo', 'Onboarding', 'Em contato', 'Proposta', 'Ganho', 'Perdido'])

    const renamed = await call(admin, 'PATCH', `/api/pipelines/${pipeline.id}/stages/${pipeline.stages[4].id}`, { name: 'Cancelado' })
    expect(renamed.json()).toMatchObject({ name: 'Cancelado', kind: 'lost' })

    expect((await call(admin, 'DELETE', `/api/pipelines/${pipeline.id}/stages/${pipeline.stages[2].id}`)).statusCode).toBe(204)
    const archived = await call(admin, 'PATCH', `/api/pipelines/${pipeline.id}`, { archived: true })
    expect(archived.json().archivedAt).not.toBeNull()
  })

  it('relocates leads when deleting a stage that has them', async () => {
    const { lead } = await insertLead(db, { pipelineId: vendasId, stageId: stageIds[0]! })
    expect((await call(admin, 'DELETE', `/api/pipelines/${vendasId}/stages/${stageIds[0]}`)).json().code).toBe('STAGE_NOT_EMPTY')
    const response = await call(admin, 'DELETE', `/api/pipelines/${vendasId}/stages/${stageIds[0]}?moveToStageId=${stageIds[1]}`)
    expect(response.statusCode).toBe(204)
    const board = (await app.inject({ url: `/api/pipelines/${vendasId}/board`, headers: { cookie: admin } })).json()
    expect(board.stages[0].leads.map((l: { id: string }) => l.id)).toEqual([lead.id])
  })

  it('validates names, colors, kinds and the order list', async () => {
    expect((await call(admin, 'POST', '/api/pipelines', { name: '   ' })).statusCode).toBe(422)
    expect((await call(admin, 'POST', '/api/pipelines', { name: 'x'.repeat(61) })).statusCode).toBe(422)
    expect((await call(admin, 'POST', `/api/pipelines/${vendasId}/stages`, { name: 'x'.repeat(41) })).statusCode).toBe(422)
    expect((await call(admin, 'POST', `/api/pipelines/${vendasId}/stages`, { name: 'Y', color: 'pink' })).statusCode).toBe(422)
    expect((await call(admin, 'PATCH', `/api/pipelines/${vendasId}/stages/${stageIds[0]}`, { kind: 'closed' })).statusCode).toBe(422)
    expect((await call(admin, 'PATCH', `/api/pipelines/${vendasId}`, {})).statusCode).toBe(422)
    expect((await call(admin, 'PUT', `/api/pipelines/${vendasId}/stages/order`, { stageIds: [] })).statusCode).toBe(422)
    expect((await call(admin, 'POST', '/api/pipelines', { name: 'vendas' })).json().code).toBe('PIPELINE_NAME_TAKEN')
  })
})
