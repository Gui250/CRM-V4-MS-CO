import { Readable } from 'node:stream'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as contactModel from '../models/contact.js'
import * as conversationModel from '../models/conversation.js'
import * as flowModel from '../models/flow.js'
import * as runModel from '../models/flow-run.js'
import type { User } from '../models/user.js'
import { fakeContext } from '../test/context.js'
import * as agents from './ai-agents.js'
import * as engine from './automation/engine.js'
import { type FlowGraph, flowGraphSchema } from './automation/graph-schema.js'
import * as flows from './flows.js'

vi.mock('../models/contact.js')
vi.mock('../models/conversation.js')
vi.mock('../models/flow.js')
vi.mock('../models/flow-run.js')
vi.mock('./ai-agents.js')
vi.mock('./automation/engine.js')

const now = new Date('2026-09-22T12:00:00Z')
const user = { id: 'u1', name: 'Admin', email: 'a@x.com', role: 'admin', status: 'active', createdAt: now, updatedAt: now } as User
const pos = { x: 0, y: 0 }
const validGraph: FlowGraph = flowGraphSchema.parse({
  nodes: [
    { id: 't', type: 'trigger.message_received', position: pos, config: { match: 'any' } },
    { id: 's', type: 'send_text', position: pos, config: { text: 'oi' } },
  ],
  edges: [{ id: 'e', source: 't', sourceHandle: 'next', target: 's' }],
})
const loneTrigger: FlowGraph = flowGraphSchema.parse({ nodes: [validGraph.nodes[0]], edges: [] })

const flow = (overrides: Partial<flowModel.FlowWithVersion> = {}): flowModel.FlowWithVersion => ({
  id: 'f1',
  name: 'Boas-vindas',
  description: null,
  status: 'draft',
  triggerType: 'message_received',
  priority: 100,
  currentVersionId: 'v1',
  activatedAt: null,
  createdByUserId: 'u1',
  updatedByUserId: 'u1',
  createdAt: now,
  updatedAt: now,
  versionNumber: 1,
  graph: validGraph,
  lastRunAt: null,
  ...overrides,
})

let fakes: ReturnType<typeof fakeContext>

beforeEach(() => {
  vi.resetAllMocks()
  fakes = fakeContext()
  vi.mocked(flowModel.findById).mockResolvedValue(flow())
  vi.mocked(flowModel.list).mockResolvedValue([flow()])
  vi.mocked(agents.findAgentForValidation).mockResolvedValue({ isActive: true })
})

describe('flows controller', () => {
  it('lists and gets flows as DTOs', async () => {
    expect(await flows.list(fakes.ctx, { status: 'active' })).toEqual([expect.objectContaining({ id: 'f1', trigger: 'message_received', versionNumber: 1 })])
    expect(flowModel.list).toHaveBeenCalledWith(fakes.ctx.db, { status: 'active' })
    expect(await flows.get(fakes.ctx, 'f1')).toMatchObject({ id: 'f1', graph: validGraph })
  })

  it('404s for unknown flows', async () => {
    vi.mocked(flowModel.findById).mockResolvedValue(null)
    await expect(flows.get(fakes.ctx, 'nope')).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('creates with trimmed name and empty description as null', async () => {
    vi.mocked(flowModel.create).mockResolvedValue(flow({ versionNumber: null, graph: null }))
    await flows.create(fakes.ctx, user, { name: '  Boas-vindas ', description: '  ' })
    expect(flowModel.create).toHaveBeenCalledWith(fakes.ctx.db, { name: 'Boas-vindas', description: null, userId: 'u1' })
  })

  it('saves a draft graph as a new version even when incomplete', async () => {
    await flows.saveGraph(fakes.ctx, user, 'f1', loneTrigger)
    expect(flowModel.saveVersion).toHaveBeenCalledWith(fakes.ctx.db, { flowId: 'f1', graph: loneTrigger, triggerType: 'message_received', userId: 'u1' })
  })

  it('rejects an invalid graph on an active flow with the issues', async () => {
    vi.mocked(flowModel.findById).mockResolvedValue(flow({ status: 'active' }))
    await expect(flows.saveGraph(fakes.ctx, user, 'f1', loneTrigger)).rejects.toMatchObject({
      code: 'INVALID_FLOW',
      httpStatus: 422,
      extra: { issues: [{ nodeId: 't', message: 'Conecte o gatilho ao primeiro bloco do fluxo.' }] },
    })
    expect(flowModel.saveVersion).not.toHaveBeenCalled()
  })

  it('activates only valid saved flows', async () => {
    await flows.activate(fakes.ctx, user, 'f1')
    expect(flowModel.setStatus).toHaveBeenCalledWith(fakes.ctx.db, 'f1', 'active', 'u1')

    vi.mocked(flowModel.findById).mockResolvedValue(flow({ graph: null, versionNumber: null }))
    await expect(flows.activate(fakes.ctx, user, 'f1')).rejects.toMatchObject({ code: 'INVALID_FLOW' })

    vi.mocked(flowModel.findById).mockResolvedValue(flow({ graph: loneTrigger }))
    await expect(flows.activate(fakes.ctx, user, 'f1')).rejects.toMatchObject({ code: 'INVALID_FLOW' })
  })

  it('checks agents and media when activating', async () => {
    const graph = flowGraphSchema.parse({
      nodes: [
        validGraph.nodes[0],
        { id: 'a', type: 'ai_agent', position: pos, config: { agentId: '0b9a3a8e-8d6f-4b1e-9d3a-2f0c6d0e1a11' } },
        { id: 'm', type: 'send_media', position: pos, config: { mediaPath: 'automation/x/a.pdf', mime: 'application/pdf', filename: 'a.pdf' } },
      ],
      edges: [
        { id: 'e1', source: 't', sourceHandle: 'next', target: 'a' },
        { id: 'e2', source: 'a', sourceHandle: 'completed', target: 'm' },
      ],
    })
    vi.mocked(flowModel.findById).mockResolvedValue(flow({ graph }))
    vi.mocked(agents.findAgentForValidation).mockResolvedValue({ isActive: false })
    fakes.storage.get.mockResolvedValue(null)
    const error = await flows.activate(fakes.ctx, user, 'f1').catch((e: unknown) => e)
    expect((error as { extra: { issues: { nodeId: string }[] } }).extra.issues.map((i) => i.nodeId).sort()).toEqual(['a', 'm'])
  })

  it('deactivates and cancels the running runs, publishing each', async () => {
    vi.mocked(runModel.cancelActiveForFlow).mockResolvedValue(['r1'])
    vi.mocked(runModel.findById).mockResolvedValue({
      id: 'r1',
      flowId: 'f1',
      versionId: 'v1',
      conversationId: 'cv1',
      origin: 'message_received',
      status: 'cancelled',
      currentNodeId: 's',
      state: {},
      resumeAt: null,
      leaseUntil: null,
      stepsCount: 1,
      startedByUserId: null,
      startedAt: now,
      finishedAt: now,
      endReason: 'flow_deactivated',
      error: null,
      createdAt: now,
      updatedAt: now,
      flowName: 'Boas-vindas',
      versionNumber: 1,
      contact: { name: 'Ana', phone: '5511' },
    })
    await flows.deactivate(fakes.ctx, user, 'f1')
    expect(flowModel.setStatus).toHaveBeenCalledWith(fakes.ctx.db, 'f1', 'inactive', 'u1')
    expect(runModel.cancelActiveForFlow).toHaveBeenCalledWith(fakes.ctx.db, 'f1', 'flow_deactivated')
    expect(fakes.bus.publish).toHaveBeenCalledWith({ type: 'run.updated', data: { run: expect.objectContaining({ id: 'r1', endReason: 'flow_deactivated' }) } })
  })

  it('duplicates as a draft copy with the current graph and a free name', async () => {
    vi.mocked(flowModel.list).mockResolvedValue([flow(), flow({ id: 'f2', name: 'Boas-vindas (cópia)' })])
    vi.mocked(flowModel.create).mockResolvedValue(flow({ id: 'f3' }))
    await flows.duplicate(fakes.ctx, user, 'f1')
    expect(flowModel.create).toHaveBeenCalledWith(fakes.ctx.db, { name: 'Boas-vindas (cópia 2)', description: null, userId: 'u1' })
    expect(flowModel.saveVersion).toHaveBeenCalledWith(fakes.ctx.db, expect.objectContaining({ flowId: 'f3', graph: validGraph }))
  })

  it('refuses to delete an active flow', async () => {
    vi.mocked(flowModel.findById).mockResolvedValue(flow({ status: 'active' }))
    await expect(flows.remove(fakes.ctx, 'f1')).rejects.toMatchObject({ code: 'FLOW_ACTIVE', httpStatus: 409 })
    vi.mocked(flowModel.findById).mockResolvedValue(flow({ status: 'inactive' }))
    await flows.remove(fakes.ctx, 'f1')
    expect(flowModel.remove).toHaveBeenCalledWith(fakes.ctx.db, 'f1')
  })

  it('stores assets under automation/ with a safe name and the chat limits', async () => {
    const asset = await flows.uploadAsset(fakes.ctx, { data: Buffer.from('pdf'), mime: 'application/pdf', filename: '../Tabela de Preços.pdf' })
    expect(asset).toMatchObject({ mime: 'application/pdf', filename: 'Tabela-de-Precos.pdf', size: 3 })
    expect(asset.mediaPath).toMatch(/^automation\/[0-9a-f-]{36}\/Tabela-de-Precos\.pdf$/)
    expect(fakes.storage.put).toHaveBeenCalledWith(asset.mediaPath, Buffer.from('pdf'), 'application/pdf')
    await expect(flows.uploadAsset(fakes.ctx, { data: Buffer.from('x'), mime: 'image/svg+xml', filename: 'a.svg' })).rejects.toMatchObject({
      code: 'UNSUPPORTED_MEDIA',
    })
  })

  it('serves only automation assets', async () => {
    fakes.storage.get.mockResolvedValue(Readable.from(['x']))
    await expect(flows.getAsset(fakes.ctx, 'automation/a/b.pdf')).resolves.toBeInstanceOf(Readable)
    await expect(flows.getAsset(fakes.ctx, 'media/2026/09/m1')).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(flows.getAsset(fakes.ctx, 'automation/../media/x')).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('test runs save the graph, reach the test number and start with origin test', async () => {
    const contact = { id: 'ct1', waJid: '5511@s.whatsapp.net', phone: '5511', name: null, avatarUrl: null, automationOptOutAt: null, automationOptOutByUserId: null, createdAt: now, updatedAt: now }
    vi.mocked(contactModel.upsertByJid).mockResolvedValue({ contact, created: true })
    vi.mocked(conversationModel.getOrCreateForContact).mockResolvedValue({
      id: 'cv1',
      contactId: 'ct1',
      lastMessageAt: null,
      lastMessagePreview: null,
      unreadCount: 0,
      handlingMode: 'human',
      handoffReason: 'x',
      handoffSummary: null,
      handoffAt: now,
      assumedByUserId: null,
      createdAt: now,
      updatedAt: now,
    })
    const run = { id: 'r1', flowId: 'f1', conversationId: 'cv1', origin: 'test', status: 'running', startedAt: now, finishedAt: null, flowName: 'x', versionNumber: 2, contact: { name: null, phone: '5511' } }
    vi.mocked(engine.start).mockResolvedValue({ run: run as unknown as runModel.RunWithContext, done: Promise.resolve() })

    const summary = await flows.startTest(fakes.ctx, user, 'f1', { graph: validGraph, phone: '5511999999999' })
    expect(flowModel.saveVersion).toHaveBeenCalled()
    expect(contactModel.upsertByJid).toHaveBeenCalledWith(fakes.ctx.db, { waJid: '5511999999999@s.whatsapp.net', name: null })
    expect(conversationModel.release).toHaveBeenCalledWith(fakes.ctx.db, 'cv1')
    expect(engine.start).toHaveBeenCalledWith(fakes.ctx, expect.objectContaining({ conversationId: 'cv1', origin: 'test', userId: 'u1' }))
    expect(summary).toMatchObject({ id: 'r1', isTest: true })
  })
})
