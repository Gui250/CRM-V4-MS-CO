import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as contactModel from '../models/contact.js'
import * as conversationModel from '../models/conversation.js'
import * as flowModel from '../models/flow.js'
import * as runModel from '../models/flow-run.js'
import { fakeContext } from '../test/context.js'
import * as engine from './automation/engine.js'
import * as connection from './connection.js'
import * as runs from './runs.js'

vi.mock('../models/contact.js')
vi.mock('../models/conversation.js')
vi.mock('../models/flow.js')
vi.mock('../models/flow-run.js')
vi.mock('./automation/engine.js')
vi.mock('./connection.js')

const now = new Date('2026-09-22T12:00:00Z')
const contact = {
  id: 'ct1',
  waJid: '5511999999999@s.whatsapp.net',
  phone: '5511999999999',
  name: 'Ana',
  avatarUrl: null,
  automationOptOutAt: null as Date | null,
  automationOptOutByUserId: null,
  createdAt: now,
  updatedAt: now,
}
const conversation = (overrides: Partial<conversationModel.ConversationWithContact> = {}): conversationModel.ConversationWithContact => ({
  id: 'cv1',
  contactId: 'ct1',
  lastMessageAt: now,
  lastMessagePreview: 'oi',
  unreadCount: 0,
  handlingMode: 'automation',
  handoffReason: null,
  handoffSummary: null,
  handoffAt: null,
  assumedByUserId: null,
  createdAt: now,
  updatedAt: now,
  contact,
  assumedBy: null,
  ...overrides,
})
const flow = (overrides: Partial<flowModel.FlowWithVersion> = {}) =>
  ({ id: 'f1', name: 'Follow-up', status: 'active', triggerType: 'manual', currentVersionId: 'v1', ...overrides }) as flowModel.FlowWithVersion
const run = (overrides: Partial<runModel.RunWithContext> = {}) =>
  ({
    id: 'r1',
    flowId: 'f1',
    versionId: 'v1',
    conversationId: 'cv1',
    origin: 'manual',
    status: 'running',
    currentNodeId: 't',
    state: {},
    resumeAt: null,
    leaseUntil: null,
    stepsCount: 0,
    startedByUserId: 'u1',
    startedAt: now,
    finishedAt: null,
    endReason: null,
    error: null,
    createdAt: now,
    updatedAt: now,
    flowName: 'Follow-up',
    versionNumber: 1,
    contact: { name: 'Ana', phone: '5511999999999' },
    ...overrides,
  }) as runModel.RunWithContext

const user = { id: 'u1' }
let fakes: ReturnType<typeof fakeContext>

beforeEach(() => {
  vi.resetAllMocks()
  fakes = fakeContext()
  vi.mocked(flowModel.findById).mockResolvedValue(flow())
  vi.mocked(conversationModel.findById).mockResolvedValue(conversation())
  vi.mocked(connection.isConnected).mockResolvedValue(true)
  vi.mocked(engine.start).mockResolvedValue({ run: run(), done: Promise.resolve() })
})

describe('startManual', () => {
  it('starts an active manual flow as the user and returns the run', async () => {
    const result = await runs.startManual(fakes.ctx, user, 'cv1', 'f1')
    expect(engine.start).toHaveBeenCalledWith(fakes.ctx, { flow: flow(), conversationId: 'cv1', origin: 'manual', userId: 'u1' })
    expect(result).toMatchObject({ id: 'r1', flowName: 'Follow-up', origin: 'manual', isTest: false })
  })

  it('rejects an inactive flow', async () => {
    vi.mocked(flowModel.findById).mockResolvedValue(flow({ status: 'inactive' }))
    await expect(runs.startManual(fakes.ctx, user, 'cv1', 'f1')).rejects.toMatchObject({ code: 'FLOW_NOT_STARTABLE', httpStatus: 422 })
  })

  it('rejects opted-out contacts and a disconnected number', async () => {
    vi.mocked(conversationModel.findById).mockResolvedValue(conversation({ contact: { ...contact, automationOptOutAt: now } }))
    await expect(runs.startManual(fakes.ctx, user, 'cv1', 'f1')).rejects.toMatchObject({ code: 'CONTACT_OPTED_OUT', httpStatus: 409 })
    vi.mocked(conversationModel.findById).mockResolvedValue(conversation())
    vi.mocked(connection.isConnected).mockResolvedValue(false)
    await expect(runs.startManual(fakes.ctx, user, 'cv1', 'f1')).rejects.toMatchObject({ code: 'WHATSAPP_DISCONNECTED', httpStatus: 409 })
    expect(engine.start).not.toHaveBeenCalled()
  })

  it('puts a conversation in human mode back to automation before starting', async () => {
    vi.mocked(conversationModel.findById).mockResolvedValue(conversation({ handlingMode: 'human' }))
    await runs.startManual(fakes.ctx, user, 'cv1', 'f1')
    expect(conversationModel.release).toHaveBeenCalledWith(fakes.ctx.db, 'cv1')
  })

  it('lets RUN_ALREADY_ACTIVE through', async () => {
    const error = Object.assign(new Error('x'), { code: 'RUN_ALREADY_ACTIVE', httpStatus: 409 })
    vi.mocked(engine.start).mockRejectedValue(error)
    await expect(runs.startManual(fakes.ctx, user, 'cv1', 'f1')).rejects.toBe(error)
  })
})

describe('startManualForPhone', () => {
  beforeEach(() => {
    fakes.evolution.checkWhatsAppNumber.mockResolvedValue({ exists: true, jid: '5511999999999@s.whatsapp.net' })
    vi.mocked(contactModel.upsertByJid).mockResolvedValue({ contact, created: true })
    vi.mocked(conversationModel.getOrCreateForContact).mockResolvedValue(conversation())
  })

  it('opens the conversation with the number and starts the flow', async () => {
    const result = await runs.startManualForPhone(fakes.ctx, user, '5511999999999', 'f1')
    expect(contactModel.upsertByJid).toHaveBeenCalledWith(fakes.ctx.db, { waJid: '5511999999999@s.whatsapp.net', name: null })
    expect(result).toMatchObject({ conversation: { id: 'cv1' }, run: { id: 'r1' } })
  })

  it('validates the phone format', async () => {
    await expect(runs.startManualForPhone(fakes.ctx, user, '+55 11 9999', 'f1')).rejects.toMatchObject({ code: 'VALIDATION_ERROR', httpStatus: 422 })
  })

  it('rejects numbers without WhatsApp', async () => {
    fakes.evolution.checkWhatsAppNumber.mockResolvedValue({ exists: false, jid: null })
    await expect(runs.startManualForPhone(fakes.ctx, user, '5511999999999', 'f1')).rejects.toMatchObject({
      code: 'PHONE_NOT_ON_WHATSAPP',
      httpStatus: 422,
    })
    expect(contactModel.upsertByJid).not.toHaveBeenCalled()
  })
})

describe('cancel', () => {
  it('stops an active run', async () => {
    vi.mocked(runModel.findById).mockResolvedValue(run())
    vi.mocked(engine.cancel).mockResolvedValue(run({ status: 'cancelled', endReason: 'stopped_by_user' }))
    expect(await runs.cancel(fakes.ctx, 'r1')).toMatchObject({ status: 'cancelled', endReason: 'stopped_by_user' })
    expect(engine.cancel).toHaveBeenCalledWith(fakes.ctx, 'r1', 'stopped_by_user')
  })

  it('409s on a finished run and 404s on an unknown one', async () => {
    vi.mocked(runModel.findById).mockResolvedValue(run({ status: 'completed' }))
    vi.mocked(engine.cancel).mockResolvedValue(null)
    await expect(runs.cancel(fakes.ctx, 'r1')).rejects.toMatchObject({ code: 'RUN_FINISHED', httpStatus: 409 })
    vi.mocked(runModel.findById).mockResolvedValue(null)
    await expect(runs.cancel(fakes.ctx, 'nope')).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
})

describe('history', () => {
  it('lists the runs of a flow as DTOs with the cursor', async () => {
    vi.mocked(runModel.listByFlow).mockResolvedValue({ items: [run({ origin: 'test' })], nextCursor: 'next' })
    const result = await runs.listByFlow(fakes.ctx, 'f1', { limit: 50, status: 'failed' })
    expect(runModel.listByFlow).toHaveBeenCalledWith(fakes.ctx.db, 'f1', { limit: 50, status: 'failed' })
    expect(result).toMatchObject({ items: [{ id: 'r1', isTest: true }], nextCursor: 'next' })
  })

  it('404s the history of an unknown flow', async () => {
    vi.mocked(flowModel.findById).mockResolvedValue(null)
    await expect(runs.listByFlow(fakes.ctx, 'nope', { limit: 50 })).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('returns run detail with graph and steps, or 404', async () => {
    vi.mocked(runModel.findDetail).mockResolvedValue({
      ...run(),
      graph: { nodes: [], edges: [] },
      steps: [
        {
          id: 's1',
          runId: 'r1',
          nodeId: 't',
          nodeType: 'trigger.manual',
          status: 'ok',
          input: null,
          output: null,
          error: null,
          startedAt: now,
          finishedAt: now,
          createdAt: now,
          updatedAt: now,
        },
      ],
    })
    expect(await runs.getDetail(fakes.ctx, 'r1')).toMatchObject({ graph: { nodes: [] }, steps: [{ nodeId: 't', startedAt: now.toISOString() }] })
    vi.mocked(runModel.findDetail).mockResolvedValue(null)
    await expect(runs.getDetail(fakes.ctx, 'nope')).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('lists the runs of a conversation', async () => {
    vi.mocked(runModel.listByConversation).mockResolvedValue([run()])
    expect(await runs.listForConversation(fakes.ctx, 'cv1')).toMatchObject([{ id: 'r1' }])
  })
})
