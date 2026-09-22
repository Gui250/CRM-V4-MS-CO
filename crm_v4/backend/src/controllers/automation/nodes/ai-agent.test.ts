import { beforeEach, describe, expect, it } from 'vitest'
import type { Db } from '../../../db/client.js'
import { encryptSecret, keyHint } from '../../../lib/secret-box.js'
import * as agentModel from '../../../models/ai-agent.js'
import * as providerModel from '../../../models/ai-provider.js'
import * as connectionModel from '../../../models/connection.js'
import * as contactModel from '../../../models/contact.js'
import * as conversationModel from '../../../models/conversation.js'
import * as flowModel from '../../../models/flow.js'
import * as runModel from '../../../models/flow-run.js'
import * as messageModel from '../../../models/message.js'
import * as userModel from '../../../models/user.js'
import { fakeContext, testConfig } from '../../../test/context.js'
import { createTestDb } from '../../../test/db.js'
import * as engine from '../engine.js'
import { onInboundMessage } from '../triggers.js'
import { AGENT_FAILED_REASON } from './ai-agent.js'

// The agent block through the real engine and triggers; the AI provider and WhatsApp are faked.

let db: Db
let fakes: ReturnType<typeof fakeContext>
let userId: string
let agentId: string
let conversationId: string
let seq = 0

const API_KEY = 'sk-test-secret-1234'
const pos = { x: 0, y: 0 }
const edge = (source: string, sourceHandle: string, target: string) => ({ id: `${source}-${sourceHandle}`, source, sourceHandle, target })

beforeEach(async () => {
  db = await createTestDb()
  fakes = fakeContext({ db })
  fakes.evolution.sendText.mockImplementation(async () => ({ waMessageId: `OUT${++seq}` }))
  await connectionModel.update(db, testConfig.EVOLUTION_INSTANCE, { status: 'connected' })
  userId = (await userModel.create(db, { name: 'Admin', email: 'a@v4.test', passwordHash: 'x', role: 'admin', status: 'active' })).id
  const sealed = encryptSecret(API_KEY, Buffer.from(testConfig.AI_CREDENTIALS_KEY, 'base64'))
  const provider = await providerModel.create(db, {
    name: 'OpenAI',
    vendor: 'openai',
    keyCiphertext: sealed.ciphertext,
    keyIv: sealed.iv,
    keyAuthTag: sealed.authTag,
    keyHint: keyHint(API_KEY),
    availableModels: ['gpt-5'],
  })
  agentId = (
    await agentModel.create(db, {
      name: 'Qualificação',
      providerId: provider.id,
      model: 'gpt-5',
      instructions: 'Pergunte o nome da empresa.',
      historySize: 20,
      createdByUserId: userId,
    })
  ).id
  const { contact } = await contactModel.upsertByJid(db, { waJid: '5511999999999@s.whatsapp.net', name: 'Ana' })
  conversationId = (await conversationModel.getOrCreateForContact(db, contact.id)).id

  const flow = await flowModel.create(db, { name: 'Agente', description: null, userId })
  const graph = {
    nodes: [
      { id: 't', type: 'trigger.message_received', position: pos, config: { match: 'any' } },
      { id: 'a', type: 'ai_agent', position: pos, config: { agentId, inactivityTimeout: { amount: 1, unit: 'hours' } } },
      { id: 'done', type: 'send_text', position: pos, config: { text: 'Obrigado!' } },
      { id: 'gone', type: 'send_text', position: pos, config: { text: 'Sumiu?' } },
      { id: 'off', type: 'handoff', position: pos, config: { reason: 'Agente desligado' } },
    ],
    edges: [edge('t', 'next', 'a'), edge('a', 'completed', 'done'), edge('a', 'no_reply', 'gone'), edge('a', 'unavailable', 'off')],
  }
  await flowModel.saveVersion(db, { flowId: flow.id, graph, triggerType: 'message_received', userId })
  await flowModel.setStatus(db, flow.id, 'active', userId)
})

async function receive(body: string) {
  const { message } = await messageModel.insertFromWhatsApp(db, {
    conversationId,
    waMessageId: `IN${++seq}`,
    direction: 'inbound',
    type: 'text',
    body,
    sentAt: new Date(Date.now() + seq),
  })
  const conversation = (await conversationModel.findById(db, conversationId))!
  await onInboundMessage(fakes.ctx, { conversation, contact: conversation.contact, message })
}

const generate = () => fakes.ai.openai.generate
const sentTexts = () => fakes.evolution.sendText.mock.calls.map(([, body]) => body)
const activeRun = async () => (await runModel.listByConversation(db, conversationId))[0]!
const later = (ms: number) => new Date(Date.now() + ms)

describe('ai_agent block', () => {
  it('answers with the decrypted key, instructions and history, credited to the agent', async () => {
    generate().mockResolvedValue({ text: 'Olá! Qual o nome da empresa?', toolCalls: [] })
    await receive('oi')

    const call = generate().mock.calls[0]![0]
    expect(call).toMatchObject({ apiKey: API_KEY, model: 'gpt-5', turns: [{ role: 'user', text: 'oi' }] })
    expect(call.system).toMatch(/^Pergunte o nome da empresa\./)
    expect(call.tools.map((t: { name: string }) => t.name)).toEqual(['transferir_para_humano', 'encerrar_atendimento'])
    expect(sentTexts()).toEqual(['Olá! Qual o nome da empresa?'])
    const { items } = await messageModel.listByConversation(db, conversationId, { limit: 1 })
    expect(items[0]?.automation).toEqual({ kind: 'agent', name: 'Qualificação' })
    expect(await activeRun()).toMatchObject({ status: 'waiting', currentNodeId: 'a', state: { awaitingReply: true, debounceReplies: true } })
  })

  it('answers a burst of messages once, after the debounce', async () => {
    generate().mockResolvedValue({ text: 'Olá!', toolCalls: [] })
    await receive('oi')
    generate().mockClear()
    generate().mockResolvedValue({ text: 'Entendi, V4 e R$ 1 mi.', toolCalls: [] })

    await receive('empresa V4')
    await receive('faturamos 1 milhão')
    expect(generate()).not.toHaveBeenCalled()

    await engine.tick(fakes.ctx, later(5_000))
    expect(generate()).toHaveBeenCalledTimes(1)
    expect(generate().mock.calls[0]![0].turns.at(-1)).toEqual({ role: 'user', text: 'faturamos 1 milhão' })
    expect(sentTexts()).toEqual(['Olá!', 'Entendi, V4 e R$ 1 mi.'])
  })

  it('hands off with the reason and summary the agent gave', async () => {
    generate().mockResolvedValue({
      text: 'Vou chamar alguém do time.',
      toolCalls: [{ name: 'transferir_para_humano', args: { motivo: 'Pediu para falar com uma pessoa', resumo: 'Quer desconto.' } }],
    })
    await receive('quero falar com uma pessoa')
    expect(sentTexts()).toEqual(['Vou chamar alguém do time.'])
    expect(await conversationModel.findById(db, conversationId)).toMatchObject({
      handlingMode: 'human',
      handoffReason: 'Pediu para falar com uma pessoa',
      handoffSummary: 'Quer desconto.',
    })
    expect(await activeRun()).toMatchObject({ status: 'cancelled', endReason: 'handoff' })
  })

  it('leaves by "completed" when the agent finishes', async () => {
    generate().mockResolvedValue({ text: '', toolCalls: [{ name: 'encerrar_atendimento', args: { resumo: 'ok' } }] })
    await receive('era só isso')
    expect(sentTexts()).toEqual(['Obrigado!'])
    expect(await activeRun()).toMatchObject({ status: 'completed' })
  })

  it('sends nothing and hands off when the provider fails', async () => {
    generate().mockRejectedValue(new Error('O provedor de IA não respondeu corretamente (tempo esgotado).'))
    await receive('oi')
    expect(sentTexts()).toEqual([])
    expect(await activeRun()).toMatchObject({ status: 'failed', error: expect.stringContaining('tempo esgotado') })
    expect(await conversationModel.findById(db, conversationId)).toMatchObject({ handlingMode: 'human', handoffReason: AGENT_FAILED_REASON })
  })

  it('leaves by "no_reply" after the inactivity timeout', async () => {
    generate().mockResolvedValue({ text: 'Olá!', toolCalls: [] })
    await receive('oi')
    await engine.tick(fakes.ctx, later(2 * 3_600_000))
    expect(sentTexts()).toEqual(['Olá!', 'Sumiu?'])
  })

  it('leaves by "unavailable" when the agent is deactivated', async () => {
    await agentModel.update(db, agentId, { isActive: false })
    await receive('oi')
    expect(generate()).not.toHaveBeenCalled()
    expect(await conversationModel.findById(db, conversationId)).toMatchObject({ handlingMode: 'human', handoffReason: 'Agente desligado' })
  })
})
