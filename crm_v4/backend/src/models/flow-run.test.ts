import { beforeEach, describe, expect, it } from 'vitest'
import type { Db } from '../db/client.js'
import { createTestDb } from '../test/db.js'
import * as contactModel from './contact.js'
import * as conversationModel from './conversation.js'
import * as flowModel from './flow.js'
import * as runModel from './flow-run.js'
import * as userModel from './user.js'

let db: Db
let flowId: string
let versionId: string

const LEASE_MS = 60_000

beforeEach(async () => {
  db = await createTestDb()
  const user = await userModel.create(db, { name: 'Admin', email: 'a@v4.test', passwordHash: 'x', role: 'admin', status: 'active' })
  const flow = await flowModel.create(db, { name: 'Boas-vindas', description: null, userId: user.id })
  flowId = flow.id
  versionId = (await flowModel.saveVersion(db, { flowId, graph: { nodes: [], edges: [] }, triggerType: 'message_received', userId: user.id })).id
})

async function conversation(phone = '5511999999999', name: string | null = 'Ana') {
  const { contact } = await contactModel.upsertByJid(db, { waJid: `${phone}@s.whatsapp.net`, name })
  return conversationModel.getOrCreateForContact(db, contact.id)
}

const start = (conversationId: string) =>
  runModel.create(db, { flowId, versionId, conversationId, origin: 'message_received', startedByUserId: null, currentNodeId: 'n1' })

describe('flow run model', () => {
  it('creates a running run with flow, version and contact context', async () => {
    const run = await start((await conversation()).id)
    expect(run).toMatchObject({
      status: 'running',
      currentNodeId: 'n1',
      stepsCount: 0,
      state: {},
      flowName: 'Boas-vindas',
      versionNumber: 1,
      contact: { name: 'Ana', phone: '5511999999999' },
    })
  })

  it('allows only one active run per conversation', async () => {
    const { id } = await conversation()
    const first = await start(id)
    await expect(start(id)).rejects.toMatchObject({ code: 'RUN_ALREADY_ACTIVE', httpStatus: 409 })
    await runModel.finish(db, first.id, { status: 'completed', endReason: 'completed' })
    await expect(start(id)).resolves.toMatchObject({ status: 'running' })
  })

  it('finds the active run of a conversation', async () => {
    const { id } = await conversation()
    expect(await runModel.findActiveByConversation(db, id)).toBeNull()
    const run = await start(id)
    expect((await runModel.findActiveByConversation(db, id))?.id).toBe(run.id)
  })

  it('never updates a finished run', async () => {
    const run = await start((await conversation()).id)
    await runModel.finish(db, run.id, { status: 'failed', endReason: 'error', error: 'boom' })
    expect(await runModel.update(db, run.id, { status: 'running' })).toBeNull()
    expect(await runModel.findById(db, run.id)).toMatchObject({ status: 'failed', error: 'boom', finishedAt: expect.any(Date) })
  })

  it('claims waiting runs that are due and running runs with an expired lease', async () => {
    const now = new Date('2026-09-22T12:00:00Z')
    const due = await start((await conversation('5511')).id)
    const later = await start((await conversation('5521')).id)
    const crashed = await start((await conversation('5531')).id)
    const busy = await start((await conversation('5541')).id)
    await runModel.update(db, due.id, { status: 'waiting', resumeAt: new Date(now.getTime() - 1) })
    await runModel.update(db, later.id, { status: 'waiting', resumeAt: new Date(now.getTime() + 60_000) })
    await runModel.update(db, crashed.id, { leaseUntil: new Date(now.getTime() - 1) })
    await runModel.update(db, busy.id, { leaseUntil: new Date(now.getTime() + 30_000) })

    const claimed = await runModel.claimDue(db, now, LEASE_MS, 10)
    expect(claimed.map((r) => r.id).sort()).toEqual([due.id, crashed.id].sort())
    expect(claimed.every((r) => r.status === 'running' && r.leaseUntil?.getTime() === now.getTime() + LEASE_MS)).toBe(true)
    expect(await runModel.claimDue(db, now, LEASE_MS, 10)).toEqual([])
  })

  it('claims one run only when nobody holds it', async () => {
    const now = new Date('2026-09-22T12:00:00Z')
    const run = await start((await conversation()).id)
    await runModel.update(db, run.id, { status: 'waiting', resumeAt: null })
    expect(await runModel.claim(db, run.id, now, LEASE_MS)).toMatchObject({ status: 'running' })
    expect(await runModel.claim(db, run.id, now, LEASE_MS)).toBeNull()
  })

  it('records steps and truncates big payloads', async () => {
    const run = await start((await conversation()).id)
    await runModel.addStep(db, { runId: run.id, nodeId: 'n1', nodeType: 'send_text', status: 'ok', output: { text: 'oi' }, startedAt: new Date() })
    await runModel.addStep(db, {
      runId: run.id,
      nodeId: 'n2',
      nodeType: 'ai_agent',
      status: 'failed',
      input: { history: 'x'.repeat(20_000) },
      error: 'timeout',
      startedAt: new Date(),
    })
    const detail = await runModel.findDetail(db, run.id)
    expect(detail?.graph).toEqual({ nodes: [], edges: [] })
    expect(detail?.steps.map((s) => [s.nodeId, s.status])).toEqual([
      ['n1', 'ok'],
      ['n2', 'failed'],
    ])
    expect(detail?.steps[0]?.output).toEqual({ text: 'oi' })
    expect(String(detail?.steps[1]?.input)).toMatch(/…\(truncado\)$/)
  })

  it('cancels the active runs of a flow', async () => {
    const active = await start((await conversation('5511')).id)
    const done = await start((await conversation('5521')).id)
    await runModel.finish(db, done.id, { status: 'completed', endReason: 'completed' })
    expect(await runModel.cancelActiveForFlow(db, flowId, 'flow_deactivated')).toEqual([active.id])
    expect(await runModel.findById(db, active.id)).toMatchObject({ status: 'cancelled', endReason: 'flow_deactivated' })
  })

  it('pages the flow history newest first and filters by status', async () => {
    const runs = []
    for (const phone of ['5511', '5521', '5531']) {
      const run = await start((await conversation(phone)).id)
      await runModel.finish(db, run.id, { status: phone === '5521' ? 'failed' : 'completed', endReason: 'completed' })
      runs.push(run)
    }
    const first = await runModel.listByFlow(db, flowId, { limit: 2 })
    expect(first.items.map((r) => r.id)).toEqual([runs[2]!.id, runs[1]!.id])
    const second = await runModel.listByFlow(db, flowId, { limit: 2, cursor: first.nextCursor! })
    expect(second).toMatchObject({ items: [{ id: runs[0]!.id }], nextCursor: null })
    expect((await runModel.listByFlow(db, flowId, { limit: 10, status: 'failed' })).items.map((r) => r.id)).toEqual([runs[1]!.id])
  })

  it('lists a conversation runs with the active one first', async () => {
    const { id } = await conversation()
    const old = await start(id)
    await runModel.finish(db, old.id, { status: 'completed', endReason: 'completed' })
    const active = await start(id)
    expect((await runModel.listByConversation(db, id)).map((r) => r.id)).toEqual([active.id, old.id])
  })

  it('deletes finished runs past retention and orphan versions', async () => {
    const { id } = await conversation()
    const run = await start(id)
    await runModel.finish(db, run.id, { status: 'completed', endReason: 'completed' })
    expect(await runModel.deleteFinishedBefore(db, new Date(Date.now() - 1_000))).toBe(0)
    expect(await runModel.deleteFinishedBefore(db, new Date(Date.now() + 1_000))).toBe(1)

    const user = await userModel.create(db, { name: 'B', email: 'b@v4.test', passwordHash: 'x', role: 'admin', status: 'active' })
    await flowModel.saveVersion(db, { flowId, graph: {}, triggerType: null, userId: user.id })
    expect(await runModel.deleteOrphanVersions(db)).toBe(1)
    expect(await flowModel.findVersion(db, versionId)).toBeNull()
  })
})
