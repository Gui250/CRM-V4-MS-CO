import { beforeEach, describe, expect, it } from 'vitest'
import type { Db } from '../../db/client.js'
import type { ContactRow } from '../../db/schema.js'
import * as connectionModel from '../../models/connection.js'
import * as contactModel from '../../models/contact.js'
import * as conversationModel from '../../models/conversation.js'
import * as flowModel from '../../models/flow.js'
import * as runModel from '../../models/flow-run.js'
import * as messageModel from '../../models/message.js'
import * as userModel from '../../models/user.js'
import { fakeContext, testConfig } from '../../test/context.js'
import { createTestDb } from '../../test/db.js'
import { AGENT_DEBOUNCE_MS, onInboundMessage } from './triggers.js'

let db: Db
let fakes: ReturnType<typeof fakeContext>
let userId: string
let contact: ContactRow
let conversationId: string
let seq = 0

const pos = { x: 0, y: 0 }
const text = (id: string, value: string) => ({ id, type: 'send_text', position: pos, config: { text: value } })
const edge = (source: string, sourceHandle: string, target: string) => ({ id: `${source}-${sourceHandle}`, source, sourceHandle, target })
const replyFlow = (config: object, reply: string) => ({
  nodes: [{ id: 't', type: 'trigger.message_received', position: pos, config }, text('s', reply)],
  edges: [edge('t', 'next', 's')],
})

beforeEach(async () => {
  db = await createTestDb()
  fakes = fakeContext({ db })
  fakes.evolution.sendText.mockImplementation(async () => ({ waMessageId: `OUT${++seq}` }))
  await connectionModel.update(db, testConfig.EVOLUTION_INSTANCE, { status: 'connected' })
  userId = (await userModel.create(db, { name: 'Admin', email: 'a@v4.test', passwordHash: 'x', role: 'admin', status: 'active' })).id
  contact = (await contactModel.upsertByJid(db, { waJid: '5511999999999@s.whatsapp.net', name: 'Ana' })).contact
  conversationId = (await conversationModel.getOrCreateForContact(db, contact.id)).id
})

async function activeFlow(name: string, graph: { nodes: object[]; edges: object[] }, priority = 100) {
  const flow = await flowModel.create(db, { name, description: null, userId })
  await flowModel.update(db, flow.id, { priority, userId })
  await flowModel.saveVersion(db, { flowId: flow.id, graph, triggerType: 'message_received', userId })
  await flowModel.setStatus(db, flow.id, 'active', userId)
  return flow
}

async function receive(body: string) {
  const { message } = await messageModel.insertFromWhatsApp(db, {
    conversationId,
    waMessageId: `IN${++seq}`,
    direction: 'inbound',
    type: 'text',
    body,
  })
  const conversation = (await conversationModel.findById(db, conversationId))!
  await onInboundMessage(fakes.ctx, { conversation, contact: conversation.contact, message })
}

const sentTexts = () => fakes.evolution.sendText.mock.calls.map(([, body]) => body)

describe('onInboundMessage', () => {
  it('starts only the highest-priority matching flow', async () => {
    await activeFlow('Genérico', replyFlow({ match: 'any' }, 'genérico'), 50)
    await activeFlow('Prioritário', replyFlow({ match: 'any' }, 'prioritário'), 1)
    await receive('oi')
    expect(sentTexts()).toEqual(['prioritário'])
  })

  it('"first_message" only fires on the first inbound message of the conversation', async () => {
    await activeFlow('Boas-vindas', replyFlow({ match: 'first_message' }, 'bem-vindo'))
    await receive('oi')
    await receive('tudo bem?')
    expect(sentTexts()).toEqual(['bem-vindo'])
  })

  it('"keyword" matches ignoring case and accents', async () => {
    await activeFlow('Preço', replyFlow({ match: 'keyword', keywords: ['preço'] }, 'tabela'))
    await receive('bom dia')
    await receive('qual o PRECO?')
    expect(sentTexts()).toEqual(['tabela'])
  })

  it('ignores outbound messages', async () => {
    await activeFlow('Genérico', replyFlow({ match: 'any' }, 'x'))
    const conversation = (await conversationModel.findById(db, conversationId))!
    await onInboundMessage(fakes.ctx, {
      conversation,
      contact: conversation.contact,
      message: { id: 'm', direction: 'outbound', type: 'text', body: 'oi' },
    })
    expect(sentTexts()).toEqual([])
  })

  it('resumes a run waiting for a reply instead of starting another flow', async () => {
    await activeFlow('Pergunta', {
      nodes: [
        { id: 't', type: 'trigger.message_received', position: pos, config: { match: 'first_message' } },
        text('q', 'Qual seu nome?'),
        { id: 'r', type: 'wait_reply', position: pos, config: { timeout: { amount: 1, unit: 'hours' } } },
        text('ok', 'Obrigado!'),
      ],
      edges: [edge('t', 'next', 'q'), edge('q', 'next', 'r'), edge('r', 'replied', 'ok')],
    })
    await activeFlow('Genérico', replyFlow({ match: 'any' }, 'genérico'), 999)
    await receive('oi')
    await receive('Ana')
    expect(sentTexts()).toEqual(['Qual seu nome?', 'Obrigado!'])
  })

  it('does nothing while another block (e.g. a fixed wait) holds the conversation', async () => {
    await activeFlow('Espera', {
      nodes: [
        { id: 't', type: 'trigger.message_received', position: pos, config: { match: 'any' } },
        { id: 'w', type: 'wait', position: pos, config: { amount: 1, unit: 'days' } },
      ],
      edges: [edge('t', 'next', 'w')],
    })
    await receive('oi')
    await receive('oi de novo')
    const runs = await runModel.listByConversation(db, conversationId)
    expect(runs).toHaveLength(1)
    expect(runs[0]).toMatchObject({ status: 'waiting' })
  })

  it('stays silent in human mode and for opted-out contacts', async () => {
    await activeFlow('Genérico', replyFlow({ match: 'any' }, 'x'))
    await conversationModel.handOff(db, conversationId, { reason: 'x', summary: null })
    await receive('oi')
    await conversationModel.release(db, conversationId)
    await contactModel.setOptOut(db, contact.id, userId)
    await receive('oi')
    expect(sentTexts()).toEqual([])
  })

  it('treats "parar" as opt-out: marks the contact and cancels the active run', async () => {
    await activeFlow('Espera', {
      nodes: [
        { id: 't', type: 'trigger.message_received', position: pos, config: { match: 'any' } },
        { id: 'w', type: 'wait', position: pos, config: { amount: 1, unit: 'days' } },
      ],
      edges: [edge('t', 'next', 'w')],
    })
    await receive('oi')
    await receive('Parar!')
    expect((await contactModel.findById(db, contact.id))?.automationOptOutAt).toBeInstanceOf(Date)
    expect((await runModel.listByConversation(db, conversationId))[0]).toMatchObject({ status: 'cancelled', endReason: 'opt_out' })
  })

  it('debounces replies to an agent: pushes resume_at instead of answering right away', async () => {
    const flow = await activeFlow('Agente', replyFlow({ match: 'any' }, 'x'))
    const version = (await flowModel.findById(db, flow.id))!
    const run = await runModel.create(db, {
      flowId: flow.id,
      versionId: version.currentVersionId!,
      conversationId,
      origin: 'message_received',
      startedByUserId: null,
      currentNodeId: 's',
    })
    await runModel.update(db, run.id, { status: 'waiting', state: { awaitingReply: true, debounceReplies: true }, resumeAt: null })

    const before = Date.now()
    await receive('primeira')
    const updated = await runModel.findById(db, run.id)
    expect(updated?.status).toBe('waiting')
    expect(updated?.resumeAt?.getTime()).toBeGreaterThanOrEqual(before + AGENT_DEBOUNCE_MS)
    expect(sentTexts()).toEqual([])
  })
})
