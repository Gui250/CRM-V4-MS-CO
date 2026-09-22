import { Readable } from 'node:stream'
import { beforeEach, describe, expect, it } from 'vitest'
import type { App } from '../app.js'
import type { Db } from '../db/client.js'
import { buildTestApp, cookieFor } from '../test/app.js'
import { createTestDb } from '../test/db.js'

let app: App
let db: Db
let admin: string
let attendant: string
let stored: Map<string, Buffer>

const pos = { x: 0, y: 0 }
const graph = {
  nodes: [
    { id: 't', type: 'trigger.message_received', position: pos, config: { match: 'any' } },
    { id: 's', type: 'send_text', position: pos, config: { text: 'Olá!' } },
  ],
  edges: [{ id: 'e', source: 't', sourceHandle: 'next', target: 's' }],
}
const manualGraph = {
  nodes: [{ id: 't', type: 'trigger.manual', position: pos, config: {} }, graph.nodes[1]],
  edges: graph.edges,
}

beforeEach(async () => {
  db = await createTestDb()
  const built = await buildTestApp({ db })
  app = built.app
  stored = new Map()
  built.storage.put.mockImplementation(async (key: string, data: Buffer) => void stored.set(key, data))
  built.storage.get.mockImplementation(async (key: string) => (stored.has(key) ? Readable.from([stored.get(key)!]) : null))
  admin = (await cookieFor(db, { name: 'Admin', role: 'admin' })).cookie
  attendant = (await cookieFor(db, { name: 'Bia', role: 'attendant' })).cookie
})

const asAdmin = (method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, payload?: unknown) =>
  app.inject({ method, url, headers: { cookie: admin }, ...(payload === undefined ? {} : { payload }) })

async function createFlow(name = 'Boas-vindas', body = graph) {
  const created = await asAdmin('POST', '/api/flows', { name })
  const id = created.json().id as string
  await asAdmin('PUT', `/api/flows/${id}/graph`, body)
  return id
}

describe('flow routes', () => {
  it('needs a session, and only admins manage flows', async () => {
    expect((await app.inject({ url: '/api/flows' })).statusCode).toBe(401)
    expect((await app.inject({ url: '/api/flows', headers: { cookie: attendant } })).statusCode).toBe(403)
    expect((await app.inject({ method: 'POST', url: '/api/flows', headers: { cookie: attendant }, payload: { name: 'x' } })).statusCode).toBe(403)
  })

  it('lets attendants read only the chat start menu', async () => {
    const id = await createFlow('Follow-up', manualGraph)
    await asAdmin('POST', `/api/flows/${id}/activate`)
    const menu = await app.inject({ url: '/api/flows?status=active', headers: { cookie: attendant } })
    expect(menu.statusCode).toBe(200)
    expect(menu.json()).toEqual([expect.objectContaining({ name: 'Follow-up', trigger: 'manual', status: 'active' })])
    expect((await app.inject({ url: '/api/flows?trigger=manual', headers: { cookie: attendant } })).statusCode).toBe(403)
  })

  it('creates, saves versions, activates and deactivates', async () => {
    const created = await asAdmin('POST', '/api/flows', { name: 'Boas-vindas', description: 'Primeiro contato' })
    expect(created.statusCode).toBe(201)
    expect(created.json()).toMatchObject({ status: 'draft', versionNumber: null, graph: null, priority: 100 })
    const id = created.json().id as string

    const saved = await asAdmin('PUT', `/api/flows/${id}/graph`, graph)
    expect(saved.json()).toMatchObject({ versionNumber: 1, trigger: 'message_received', graph })

    expect((await asAdmin('POST', `/api/flows/${id}/activate`)).json()).toMatchObject({ status: 'active' })
    expect((await asAdmin('PUT', `/api/flows/${id}/graph`, graph)).json()).toMatchObject({ versionNumber: 2, status: 'active' })
    expect((await asAdmin('POST', `/api/flows/${id}/deactivate`)).json()).toMatchObject({ status: 'inactive' })
  })

  it('answers 422 INVALID_FLOW with the issues when activating a broken flow', async () => {
    const id = await createFlow('Quebrado', { nodes: [graph.nodes[0]], edges: [] })
    const response = await asAdmin('POST', `/api/flows/${id}/activate`)
    expect(response.statusCode).toBe(422)
    expect(response.json()).toMatchObject({
      code: 'INVALID_FLOW',
      issues: [{ nodeId: 't', message: 'Conecte o gatilho ao primeiro bloco do fluxo.' }],
    })
  })

  it('rejects a graph that breaks the block schema', async () => {
    const id = await createFlow()
    const bad = { nodes: [{ id: 'x', type: 'send_text', position: pos, config: { text: '' } }], edges: [] }
    expect((await asAdmin('PUT', `/api/flows/${id}/graph`, bad)).statusCode).toBe(422)
  })

  it('renames, changes priority, duplicates and deletes', async () => {
    const id = await createFlow()
    expect((await asAdmin('PATCH', `/api/flows/${id}`, { name: 'Boas-vindas V2', priority: 5 })).json()).toMatchObject({
      name: 'Boas-vindas V2',
      priority: 5,
    })
    expect((await asAdmin('PATCH', `/api/flows/${id}`, {})).statusCode).toBe(422)

    const copy = await asAdmin('POST', `/api/flows/${id}/duplicate`)
    expect(copy.statusCode).toBe(201)
    expect(copy.json()).toMatchObject({ name: 'Boas-vindas V2 (cópia)', status: 'draft', graph })

    await asAdmin('POST', `/api/flows/${id}/activate`)
    expect((await asAdmin('DELETE', `/api/flows/${id}`)).statusCode).toBe(409)
    await asAdmin('POST', `/api/flows/${id}/deactivate`)
    expect((await asAdmin('DELETE', `/api/flows/${id}`)).statusCode).toBe(204)
    expect((await asAdmin('GET', `/api/flows/${id}`)).statusCode).toBe(404)
  })

  it('rejects a duplicated name', async () => {
    await createFlow('Único')
    expect((await asAdmin('POST', '/api/flows', { name: 'Único' })).statusCode).toBe(409)
  })

  it('uploads and serves assets for the media block', async () => {
    const boundary = '----v4test'
    const body = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="file"; filename="Tabela de Preços.pdf"',
      'Content-Type: application/pdf',
      '',
      '%PDF-1.4 fake',
      `--${boundary}--`,
      '',
    ].join('\r\n')
    const uploaded = await app.inject({
      method: 'POST',
      url: '/api/flow-assets',
      headers: { cookie: admin, 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: body,
    })
    expect(uploaded.statusCode).toBe(201)
    const { mediaPath, filename } = uploaded.json() as { mediaPath: string; filename: string }
    expect(filename).toBe('Tabela-de-Precos.pdf')

    const download = await app.inject({ url: `/api/flow-assets/${mediaPath}`, headers: { cookie: admin } })
    expect(download.statusCode).toBe(200)
    expect(download.body).toContain('%PDF-1.4 fake')
    expect((await app.inject({ url: `/api/flow-assets/${mediaPath}`, headers: { cookie: attendant } })).statusCode).toBe(403)
    expect((await app.inject({ url: '/api/flow-assets/automation/nope/x.pdf', headers: { cookie: admin } })).statusCode).toBe(404)
  })

  it('validates the test run payload', async () => {
    const id = await createFlow()
    expect((await asAdmin('POST', `/api/flows/${id}/test`, { graph, phone: 'abc' })).statusCode).toBe(422)
    const broken = await asAdmin('POST', `/api/flows/${id}/test`, { graph: { nodes: [graph.nodes[0]], edges: [] }, phone: '5511999999999' })
    expect(broken.json()).toMatchObject({ code: 'INVALID_FLOW' })
  })
})
