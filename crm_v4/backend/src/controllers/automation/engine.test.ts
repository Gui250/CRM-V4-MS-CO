import { beforeEach, describe, expect, it } from 'vitest'
import type { Db } from '../../db/client.js'
import * as connectionModel from '../../models/connection.js'
import * as contactModel from '../../models/contact.js'
import * as conversationModel from '../../models/conversation.js'
import * as flowModel from '../../models/flow.js'
import * as runModel from '../../models/flow-run.js'
import * as messageModel from '../../models/message.js'
import * as userModel from '../../models/user.js'
import { fakeContext, testConfig } from '../../test/context.js'
import { createTestDb } from '../../test/db.js'
import * as engine from './engine.js'
import { SEND_FAILED_REASON } from './nodes/send.js'

// Engine + block executors + real models on PGlite; only WhatsApp is faked.

let db: Db
let fakes: ReturnType<typeof fakeContext>
let userId: string
let conversationId: string
let waSeq = 0

const pos = { x: 0, y: 0 }
const trigger = { id: 't', type: 'trigger.message_received', position: pos, config: { match: 'any' } }
const text = (id: string, value: string) => ({ id, type: 'send_text', position: pos, config: { text: value } })
const edge = (source: string, sourceHandle: string, target: string) => ({ id: `${source}-${sourceHandle}`, source, sourceHandle, target })

beforeEach(async () => {
  db = await createTestDb()
  fakes = fakeContext({ db })
  fakes.evolution.sendText.mockImplementation(async () => ({ waMessageId: `WA${++waSeq}` }))
  await connectionModel.get(db, testConfig.EVOLUTION_INSTANCE)
  await connectionModel.update(db, testConfig.EVOLUTION_INSTANCE, { status: 'connected' })
  userId = (await userModel.create(db, { name: 'Admin', email: 'a@v4.test', passwordHash: 'x', role: 'admin', status: 'active' })).id
  const { contact } = await contactModel.upsertByJid(db, { waJid: '5511999999999@s.whatsapp.net', name: 'Maria Silva' })
  conversationId = (await conversationModel.getOrCreateForContact(db, contact.id)).id
})

async function activeFlow(nodes: object[], edges: object[], name = 'Fluxo') {
  const flow = await flowModel.create(db, { name, description: null, userId })
  await flowModel.saveVersion(db, { flowId: flow.id, graph: { nodes, edges }, triggerType: 'message_received', userId })
  await flowModel.setStatus(db, flow.id, 'active', userId)
  return (await flowModel.findById(db, flow.id))!
}

async function startRun(flow: flowModel.FlowWithVersion) {
  const { run, done } = await engine.start(fakes.ctx, { flow, conversationId, origin: 'message_received', userId: null })
  await done
  return (await runModel.findDetail(db, run.id))!
}

const sentTexts = () => fakes.evolution.sendText.mock.calls.map(([, body]) => body)
const later = (ms: number) => new Date(Date.now() + ms)

describe('engine', () => {
  it('runs the welcome flow: waits, then sends the rendered text as the automation', async () => {
    const flow = await activeFlow(
      [trigger, { id: 'w', type: 'wait', position: pos, config: { amount: 5, unit: 'seconds' } }, text('s', 'Olá, {{contato.primeiro_nome}}!')],
      [edge('t', 'next', 'w'), edge('w', 'next', 's')],
      'Boas-vindas',
    )
    const waiting = await startRun(flow)
    expect(waiting).toMatchObject({ status: 'waiting', currentNodeId: 'w', stepsCount: 2 })
    expect(sentTexts()).toEqual([])

    expect(await engine.tick(fakes.ctx, later(1_000))).toBe(0)
    expect(await engine.tick(fakes.ctx, later(6_000))).toBe(1)

    const done = await runModel.findDetail(db, waiting.id)
    expect(done).toMatchObject({ status: 'completed', endReason: 'completed', stepsCount: 4 })
    expect(done?.steps.map((s) => [s.nodeId, s.status])).toEqual([
      ['t', 'ok'],
      ['w', 'ok'],
      ['w', 'ok'],
      ['s', 'ok'],
    ])
    expect(sentTexts()).toEqual(['Olá, Maria!'])
    const { items } = await messageModel.listByConversation(db, conversationId, { limit: 5 })
    expect(items[0]).toMatchObject({ flowRunId: waiting.id, sentByUserId: null, automation: { kind: 'flow', name: 'Boas-vindas' } })
  })

  it('follows the condition branch', async () => {
    const condition = { id: 'c', type: 'condition', position: pos, config: { source: 'contact_name', operator: 'starts_with', value: 'maria' } }
    const flow = await activeFlow([trigger, condition, text('yes', 'sim'), text('no', 'não')], [
      edge('t', 'next', 'c'),
      edge('c', 'yes', 'yes'),
      edge('c', 'no', 'no'),
    ])
    expect(await startRun(flow)).toMatchObject({ status: 'completed' })
    expect(sentTexts()).toEqual(['sim'])
  })

  it('waits for a reply and follows "replied", or "timeout" when it never comes', async () => {
    const waitReply = { id: 'r', type: 'wait_reply', position: pos, config: { timeout: { amount: 1, unit: 'hours' } } }
    const nodes = [trigger, waitReply, text('ok', 'respondeu'), text('late', 'sem resposta')]
    const edges = [edge('t', 'next', 'r'), edge('r', 'replied', 'ok'), edge('r', 'timeout', 'late')]
    const flow = await activeFlow(nodes, edges)

    const first = await startRun(flow)
    expect(first).toMatchObject({ status: 'waiting', currentNodeId: 'r', state: { awaitingReply: true } })
    await engine.resume(fakes.ctx, first.id, { reply: true })
    expect(await runModel.findById(db, first.id)).toMatchObject({ status: 'completed' })
    expect(sentTexts()).toEqual(['respondeu'])

    const second = await startRun(flow)
    await engine.tick(fakes.ctx, later(2 * 3_600_000))
    expect(await runModel.findById(db, second.id)).toMatchObject({ status: 'completed' })
    expect(sentTexts()).toEqual(['respondeu', 'sem resposta'])
  })

  it('stops runaway loops at 100 blocks', async () => {
    const a = { id: 'a', type: 'condition', position: pos, config: { source: 'contact_name', operator: 'is_empty', value: '' } }
    const b = { ...a, id: 'b' }
    const flow = await activeFlow([trigger, a, b], [edge('t', 'next', 'a'), edge('a', 'no', 'b'), edge('b', 'no', 'a')])
    expect(await startRun(flow)).toMatchObject({ status: 'failed', endReason: 'loop_limit', stepsCount: engine.MAX_STEPS })
  })

  it('fails the run and hands off when WhatsApp rejects the message', async () => {
    fakes.evolution.sendText.mockRejectedValue(new Error('evolution down'))
    const flow = await activeFlow([trigger, text('s', 'oi')], [edge('t', 'next', 's')])
    const run = await startRun(flow)
    expect(run).toMatchObject({ status: 'failed', endReason: 'error' })
    expect(run.steps.at(-1)).toMatchObject({ nodeId: 's', status: 'failed' })
    expect(await conversationModel.findById(db, conversationId)).toMatchObject({ handlingMode: 'human', handoffReason: SEND_FAILED_REASON })
  })

  it('fails and hands off when the number is disconnected, without trying to send', async () => {
    await connectionModel.update(db, testConfig.EVOLUTION_INSTANCE, { status: 'disconnected' })
    const flow = await activeFlow([trigger, text('s', 'oi')], [edge('t', 'next', 's')])
    expect(await startRun(flow)).toMatchObject({ status: 'failed', error: expect.stringContaining('desconectado') })
    expect(fakes.evolution.sendText).not.toHaveBeenCalled()
  })

  it('hands off on the handoff block', async () => {
    const handoff = { id: 'h', type: 'handoff', position: pos, config: { reason: 'Quer negociar preço' } }
    const flow = await activeFlow([trigger, handoff], [edge('t', 'next', 'h')])
    expect(await startRun(flow)).toMatchObject({ status: 'cancelled', endReason: 'handoff' })
    expect(await conversationModel.findById(db, conversationId)).toMatchObject({ handlingMode: 'human', handoffReason: 'Quer negociar preço' })
  })

  it('cancels a waiting run whose flow was deactivated', async () => {
    const flow = await activeFlow([trigger, { id: 'w', type: 'wait', position: pos, config: { amount: 1, unit: 'minutes' } }, text('s', 'x')], [
      edge('t', 'next', 'w'),
      edge('w', 'next', 's'),
    ])
    const run = await startRun(flow)
    await flowModel.setStatus(db, flow.id, 'inactive', userId)
    await engine.tick(fakes.ctx, later(120_000))
    expect(await runModel.findById(db, run.id)).toMatchObject({ status: 'cancelled', endReason: 'flow_deactivated' })
    expect(sentTexts()).toEqual([])
  })

  it('keeps running the version it started on after the flow is edited', async () => {
    const wait = { id: 'w', type: 'wait', position: pos, config: { amount: 1, unit: 'minutes' } }
    const flow = await activeFlow([trigger, wait, text('s', 'versão 1')], [edge('t', 'next', 'w'), edge('w', 'next', 's')])
    await startRun(flow)
    await flowModel.saveVersion(db, {
      flowId: flow.id,
      graph: { nodes: [trigger, wait, text('s', 'versão 2')], edges: [edge('t', 'next', 'w'), edge('w', 'next', 's')] },
      triggerType: 'message_received',
      userId,
    })
    await engine.tick(fakes.ctx, later(120_000))
    expect(sentTexts()).toEqual(['versão 1'])
  })

  it('resumes a run whose worker died mid-way (expired lease)', async () => {
    const flow = await activeFlow([trigger, text('s', 'retomado')], [edge('t', 'next', 's')])
    const run = await runModel.create(db, {
      flowId: flow.id,
      versionId: flow.currentVersionId!,
      conversationId,
      origin: 'message_received',
      startedByUserId: null,
      currentNodeId: 's',
    })
    await runModel.update(db, run.id, { leaseUntil: new Date(Date.now() - 1_000) })
    expect(await engine.tick(fakes.ctx, new Date())).toBe(1)
    expect(sentTexts()).toEqual(['retomado'])
  })

  it('publishes run.updated along the way', async () => {
    const flow = await activeFlow([trigger, text('s', 'oi')], [edge('t', 'next', 's')])
    await startRun(flow)
    const statuses = fakes.bus.publish.mock.calls.filter(([e]) => e.type === 'run.updated').map(([e]) => (e.data as { run: { status: string } }).run.status)
    expect(statuses[0]).toBe('running')
    expect(statuses.at(-1)).toBe('completed')
  })

  it('cleanup deletes runs finished more than 90 days ago', async () => {
    const flow = await activeFlow([trigger, text('s', 'oi')], [edge('t', 'next', 's')])
    const run = await startRun(flow)
    await engine.cleanup(fakes.ctx, later(89 * 86_400_000))
    expect(await runModel.findById(db, run.id)).not.toBeNull()
    await engine.cleanup(fakes.ctx, later(91 * 86_400_000))
    expect(await runModel.findById(db, run.id)).toBeNull()
  })
})
