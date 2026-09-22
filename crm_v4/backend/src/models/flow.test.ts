import { beforeEach, describe, expect, it } from 'vitest'
import type { Db } from '../db/client.js'
import { createTestDb } from '../test/db.js'
import * as flowModel from './flow.js'
import * as userModel from './user.js'

let db: Db
let userId: string

const AGENT_ID = '0b9a3a8e-8d6f-4b1e-9d3a-2f0c6d0e1a11'
const graphWithAgent = (agentId: string) => ({
  nodes: [
    { id: 't', type: 'trigger.message_received', position: { x: 0, y: 0 }, config: { match: 'any' } },
    { id: 'a', type: 'ai_agent', position: { x: 0, y: 0 }, config: { agentId, inactivityTimeout: { amount: 24, unit: 'hours' } } },
  ],
  edges: [{ id: 'e', source: 't', sourceHandle: 'next', target: 'a' }],
})

beforeEach(async () => {
  db = await createTestDb()
  userId = (await userModel.create(db, { name: 'Admin', email: 'admin@v4.test', passwordHash: 'x', role: 'admin', status: 'active' })).id
})

const create = (name: string) => flowModel.create(db, { name, description: null, userId })

describe('flow model', () => {
  it('creates a draft without version', async () => {
    const flow = await create('Boas-vindas')
    expect(flow).toMatchObject({ name: 'Boas-vindas', status: 'draft', priority: 100, triggerType: null, versionNumber: null, graph: null, lastRunAt: null })
  })

  it('rejects duplicated names', async () => {
    await create('Boas-vindas')
    await expect(create('Boas-vindas')).rejects.toMatchObject({ code: 'FLOW_NAME_TAKEN', httpStatus: 409 })
    const other = await create('Outro')
    await expect(flowModel.update(db, other.id, { name: 'Boas-vindas', userId })).rejects.toMatchObject({ code: 'FLOW_NAME_TAKEN' })
  })

  it('numbers versions per flow and points the flow to the latest', async () => {
    const flow = await create('Boas-vindas')
    const v1 = await flowModel.saveVersion(db, { flowId: flow.id, graph: { nodes: [], edges: [] }, triggerType: null, userId })
    const v2 = await flowModel.saveVersion(db, { flowId: flow.id, graph: graphWithAgent(AGENT_ID), triggerType: 'message_received', userId })
    expect([v1.number, v2.number]).toEqual([1, 2])
    const found = await flowModel.findById(db, flow.id)
    expect(found).toMatchObject({ versionNumber: 2, currentVersionId: v2.id, triggerType: 'message_received', graph: graphWithAgent(AGENT_ID) })
    expect((await flowModel.findVersion(db, v1.id))?.graph).toEqual({ nodes: [], edges: [] })

    const other = await create('Outro')
    expect((await flowModel.saveVersion(db, { flowId: other.id, graph: {}, triggerType: null, userId })).number).toBe(1)
  })

  it('updates name, description and priority', async () => {
    const flow = await create('A')
    expect(await flowModel.update(db, flow.id, { name: 'B', description: 'desc', priority: 5, userId })).toMatchObject({
      name: 'B',
      description: 'desc',
      priority: 5,
    })
  })

  it('sets status and records activation time', async () => {
    const flow = await create('A')
    await flowModel.setStatus(db, flow.id, 'active', userId)
    expect(await flowModel.findById(db, flow.id)).toMatchObject({ status: 'active', activatedAt: expect.any(Date) })
  })

  it('lists with filters, ordered by priority then name', async () => {
    const low = await create('Zeta')
    const high = await create('Alfa')
    const manual = await create('Manual')
    await flowModel.update(db, low.id, { priority: 10, userId })
    await flowModel.update(db, high.id, { priority: 1, userId })
    await flowModel.saveVersion(db, { flowId: manual.id, graph: {}, triggerType: 'manual', userId })
    await flowModel.setStatus(db, manual.id, 'active', userId)

    expect((await flowModel.list(db)).map((f) => f.name)).toEqual(['Alfa', 'Zeta', 'Manual'])
    expect((await flowModel.list(db, { trigger: 'manual', status: 'active' })).map((f) => f.name)).toEqual(['Manual'])
  })

  it('lists active flows of a trigger by priority', async () => {
    for (const [name, priority] of [
      ['B', 20],
      ['A', 10],
      ['Inactive', 1],
    ] as const) {
      const flow = await create(name)
      await flowModel.update(db, flow.id, { priority, userId })
      await flowModel.saveVersion(db, { flowId: flow.id, graph: {}, triggerType: 'message_received', userId })
      if (name !== 'Inactive') await flowModel.setStatus(db, flow.id, 'active', userId)
    }
    expect((await flowModel.listActiveByTrigger(db, 'message_received')).map((f) => f.name)).toEqual(['A', 'B'])
  })

  it('finds active flows using an agent in their current version', async () => {
    const uses = await create('Usa agente')
    await flowModel.saveVersion(db, { flowId: uses.id, graph: graphWithAgent(AGENT_ID), triggerType: 'message_received', userId })
    await flowModel.setStatus(db, uses.id, 'active', userId)
    const draft = await create('Rascunho')
    await flowModel.saveVersion(db, { flowId: draft.id, graph: graphWithAgent(AGENT_ID), triggerType: 'message_received', userId })

    expect(await flowModel.findActiveReferencingAgent(db, AGENT_ID)).toEqual([{ id: uses.id, name: 'Usa agente' }])
    expect(await flowModel.findActiveReferencingAgent(db, '11111111-1111-4111-8111-111111111111')).toEqual([])
  })

  it('removes a flow with its versions', async () => {
    const flow = await create('A')
    const version = await flowModel.saveVersion(db, { flowId: flow.id, graph: {}, triggerType: null, userId })
    await flowModel.remove(db, flow.id)
    expect(await flowModel.findById(db, flow.id)).toBeNull()
    expect(await flowModel.findVersion(db, version.id)).toBeNull()
  })
})
