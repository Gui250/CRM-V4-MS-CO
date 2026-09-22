import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { App } from '../app.js'
import type { Db } from '../db/client.js'
import type { BiConnectors } from '../integrations/bi-connectors/index.js'
import { buildTestApp, cookieFor } from '../test/app.js'
import { createTestDb } from '../test/db.js'
import { seedChat } from '../test/bi-fixtures.js'

let app: App
let db: Db
let admin: string
let attendant: string
let attendantId: string

const MSG = 'internal:whatsapp_messages'

async function* rows() {
  yield { vendedor: 'Ana', valor: 10 }
  yield { vendedor: 'Bruno', valor: 20 }
}

beforeEach(async () => {
  db = await createTestDb()
  const biConnectors: BiConnectors = { read: vi.fn(() => rows()), listSheets: vi.fn(async () => []) }
  app = (await buildTestApp({ db, biConnectors })).app
  await seedChat(db)
  admin = (await cookieFor(db, { name: 'Chefe', role: 'admin' })).cookie
  const created = await cookieFor(db, { name: 'Bia', role: 'attendant' })
  attendant = created.cookie
  attendantId = created.user.id
}, 60_000)

const json = (cookie: string, method: 'POST' | 'PUT' | 'PATCH', url: string, payload: unknown) =>
  app.inject({ method, url, headers: { cookie }, payload: payload as object })

describe('BI routes', () => {
  it('requires a session', async () => {
    expect((await app.inject({ url: '/api/bi/sources' })).statusCode).toBe(401)
    expect((await app.inject({ method: 'POST', url: '/api/bi/query', payload: { sourceId: MSG } })).statusCode).toBe(401)
  })

  it('lists internal sources and answers component queries', async () => {
    const list = await app.inject({ url: '/api/bi/sources', headers: { cookie: attendant } })
    expect(list.json().map((source: { id: string }) => source.id)).toContain(MSG)
    const response = await json(attendant, 'POST', '/api/bi/query', {
      sourceId: MSG,
      dimensions: [{ sourceId: MSG, field: 'direcao' }],
      measures: [{ sourceId: MSG, field: 'mensagem', aggregation: 'count' }],
    })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({ rows: [['Enviada', 3], ['Recebida', 2]], staleWarning: null, missingFields: [] })
  })

  it('rejects invalid query bodies with 422', async () => {
    const response = await json(attendant, 'POST', '/api/bi/query', { sourceId: MSG, limit: 5000 })
    expect(response.statusCode).toBe(422)
  })

  it('creates, saves and detects conflicting saves of a report', async () => {
    const created = await json(attendant, 'POST', '/api/bi/reports', { name: 'Atendimento', templateId: 'whatsapp_attendance' })
    expect(created.statusCode).toBe(201)
    const report = created.json()
    expect(report).toMatchObject({ permission: 'owner', version: 1 })

    const saved = await json(attendant, 'PUT', `/api/bi/reports/${report.id}`, { name: 'Atendimento 2', definition: report.definition, version: 1 })
    expect(saved.json()).toMatchObject({ name: 'Atendimento 2', version: 2 })

    const stale = await json(attendant, 'PUT', `/api/bi/reports/${report.id}`, { name: 'X', definition: report.definition, version: 1 })
    expect(stale.statusCode).toBe(409)
    expect(stale.json()).toMatchObject({ code: 'REPORT_CONFLICT', details: { version: 2, updatedByName: 'Bia' } })

    const forced = await json(attendant, 'PUT', `/api/bi/reports/${report.id}`, { name: 'X', definition: report.definition, version: 1, force: true })
    expect(forced.json()).toMatchObject({ version: 3 })
  })

  it('shares a report for viewing only', async () => {
    const report = (await json(admin, 'POST', '/api/bi/reports', { name: 'Diretoria' })).json()
    expect((await app.inject({ url: `/api/bi/reports/${report.id}`, headers: { cookie: attendant } })).statusCode).toBe(404)
    const shares = await json(admin, 'PUT', `/api/bi/reports/${report.id}/shares`, [{ userId: attendantId, permission: 'view' }])
    expect(shares.json()).toEqual([{ userId: attendantId, userName: 'Bia', permission: 'view' }])
    const seen = await app.inject({ url: `/api/bi/reports/${report.id}`, headers: { cookie: attendant } })
    expect(seen.json()).toMatchObject({ permission: 'view' })
    const edit = await json(attendant, 'PUT', `/api/bi/reports/${report.id}`, { name: 'x', definition: report.definition, version: 1 })
    expect(edit.statusCode).toBe(403)
  })

  it('keeps source management admin-only and never returns secrets', async () => {
    const input = {
      name: 'Vendas',
      kind: 'api',
      config: { url: 'https://api.test', method: 'GET', headers: [], query: [] },
      secrets: { headers: [{ name: 'Authorization', value: 'Bearer muito-secreto' }] },
    }
    expect((await json(attendant, 'POST', '/api/bi/sources', input)).statusCode).toBe(403)
    const created = await json(admin, 'POST', '/api/bi/sources', input)
    expect(created.statusCode).toBe(201)
    expect(created.body).not.toContain('muito-secreto')
    const list = await app.inject({ url: '/api/bi/sources', headers: { cookie: admin } })
    expect(list.body).not.toContain('muito-secreto')
    expect((await app.inject({ method: 'DELETE', url: `/api/bi/sources/${created.json().id}`, headers: { cookie: attendant } })).statusCode).toBe(403)
  })

  it('previews a source and downloads rows as CSV', async () => {
    const preview = await json(admin, 'POST', '/api/bi/sources/preview', { kind: 'api', config: { url: 'https://api.test', method: 'GET', headers: [], query: [] } })
    expect(preview.json()).toMatchObject({ rows: [['Ana', 10], ['Bruno', 20]], totalRowsRead: 2 })
    const csv = await json(attendant, 'POST', '/api/bi/rows.csv', { sourceId: MSG, filters: [{ sourceId: MSG, field: 'direcao', op: 'in', values: ['Recebida'] }] })
    expect(csv.headers['content-type']).toContain('text/csv')
    expect(csv.headers['content-disposition']).toContain('attachment')
    expect(csv.body.split('\r\n').filter(Boolean)).toHaveLength(3)
  })
})
