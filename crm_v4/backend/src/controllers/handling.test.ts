import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as contactModel from '../models/contact.js'
import * as conversationModel from '../models/conversation.js'
import * as runModel from '../models/flow-run.js'
import * as messageModel from '../models/message.js'
import { fakeContext } from '../test/context.js'
import * as handling from './handling.js'

vi.mock('../models/contact.js')
vi.mock('../models/conversation.js')
vi.mock('../models/flow-run.js')
vi.mock('../models/message.js')

const now = new Date('2026-09-22T12:00:00Z')
const contact = {
  id: 'ct1',
  waJid: '5511@s.whatsapp.net',
  phone: '5511',
  name: 'Ana',
  avatarUrl: null,
  automationOptOutAt: null,
  automationOptOutByUserId: null,
  createdAt: now,
  updatedAt: now,
}
const conversation: conversationModel.ConversationWithContact = {
  id: 'cv1',
  contactId: 'ct1',
  lastMessageAt: now,
  lastMessagePreview: 'oi',
  unreadCount: 0,
  handlingMode: 'human',
  handoffReason: 'Pediu uma pessoa',
  handoffSummary: 'resumo',
  handoffAt: now,
  assumedByUserId: null,
  createdAt: now,
  updatedAt: now,
  contact,
  assumedBy: null,
}
const activeRun = {
  id: 'r1',
  flowId: 'f1',
  versionId: 'v1',
  conversationId: 'cv1',
  origin: 'message_received',
  status: 'waiting',
  currentNodeId: 'n2',
  state: {},
  resumeAt: null,
  leaseUntil: null,
  stepsCount: 2,
  startedByUserId: null,
  startedAt: now,
  finishedAt: null,
  endReason: null,
  error: null,
  createdAt: now,
  updatedAt: now,
  flowName: 'Qualificação',
  versionNumber: 1,
  contact: { name: 'Ana', phone: '5511' },
} as runModel.RunWithContext

let fakes: ReturnType<typeof fakeContext>
const published = (type: string) => fakes.bus.publish.mock.calls.filter(([event]) => event.type === type).map(([event]) => event.data)

beforeEach(() => {
  vi.resetAllMocks()
  fakes = fakeContext()
  vi.mocked(conversationModel.findById).mockResolvedValue(conversation)
  vi.mocked(conversationModel.getOrCreateForContact).mockResolvedValue(conversation)
  vi.mocked(contactModel.findById).mockResolvedValue(contact)
  vi.mocked(runModel.findActiveByConversation).mockResolvedValue(activeRun)
  vi.mocked(runModel.finish).mockImplementation(async (_db, _id, result) => ({ ...activeRun, ...result, finishedAt: now }))
  vi.mocked(messageModel.listRecentForAgent).mockResolvedValue([
    { id: 'm1', direction: 'inbound', type: 'text', body: 'Quero falar com alguém', sentAt: now },
    { id: 'm2', direction: 'outbound', type: 'image', body: null, sentAt: now },
  ])
})

describe('handOff', () => {
  it('cancels the active run as handoff, stores reason and summary and publishes both changes', async () => {
    const dto = await handling.handOff(fakes.ctx, 'cv1', { reason: 'Pediu uma pessoa', summary: 'Cliente quer preço' })
    expect(runModel.finish).toHaveBeenCalledWith(fakes.ctx.db, 'r1', { status: 'cancelled', endReason: 'handoff' })
    expect(conversationModel.handOff).toHaveBeenCalledWith(fakes.ctx.db, 'cv1', { reason: 'Pediu uma pessoa', summary: 'Cliente quer preço' })
    expect(published('run.updated')).toEqual([{ run: expect.objectContaining({ id: 'r1', status: 'cancelled', endReason: 'handoff' }) }])
    expect(published('conversation.updated')).toEqual([{ conversation: dto }])
    expect(dto.handling).toMatchObject({ mode: 'human', reason: 'Pediu uma pessoa' })
  })

  it('falls back to the last messages as summary', async () => {
    await handling.handOff(fakes.ctx, 'cv1', { reason: 'Falha no agente de IA' })
    expect(messageModel.listRecentForAgent).toHaveBeenCalledWith(fakes.ctx.db, 'cv1', handling.FALLBACK_SUMMARY_MESSAGES)
    expect(conversationModel.handOff).toHaveBeenCalledWith(fakes.ctx.db, 'cv1', {
      reason: 'Falha no agente de IA',
      summary: 'Contato: Quero falar com alguém\nEmpresa: [imagem]',
    })
  })

  it('works when no run is active', async () => {
    vi.mocked(runModel.findActiveByConversation).mockResolvedValue(null)
    await handling.handOff(fakes.ctx, 'cv1', { reason: 'x', summary: 'y' })
    expect(runModel.finish).not.toHaveBeenCalled()
    expect(published('run.updated')).toEqual([])
  })
})

describe('assume and release', () => {
  it('assume stops the automation and assigns the attendant', async () => {
    await handling.assume(fakes.ctx, { id: 'u1' }, 'cv1')
    expect(runModel.finish).toHaveBeenCalledWith(fakes.ctx.db, 'r1', { status: 'cancelled', endReason: 'stopped_by_user' })
    expect(conversationModel.assume).toHaveBeenCalledWith(fakes.ctx.db, 'cv1', 'u1')
    expect(published('conversation.updated')).toHaveLength(1)
  })

  it('release goes back to automation', async () => {
    await handling.release(fakes.ctx, 'cv1')
    expect(conversationModel.release).toHaveBeenCalledWith(fakes.ctx.db, 'cv1')
    expect(published('conversation.updated')).toHaveLength(1)
  })

  it('404s for an unknown conversation', async () => {
    vi.mocked(conversationModel.findById).mockResolvedValue(null)
    await expect(handling.release(fakes.ctx, 'nope')).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
})

describe('opt-out', () => {
  it('marks the contact, cancels the active run as opt_out and publishes', async () => {
    await handling.setOptOut(fakes.ctx, { id: 'u1' }, 'ct1')
    expect(contactModel.setOptOut).toHaveBeenCalledWith(fakes.ctx.db, 'ct1', 'u1')
    expect(runModel.finish).toHaveBeenCalledWith(fakes.ctx.db, 'r1', { status: 'cancelled', endReason: 'opt_out' })
    expect(published('conversation.updated')).toHaveLength(1)
  })

  it('records a contact-requested opt-out without user', async () => {
    await handling.setOptOut(fakes.ctx, null, 'ct1')
    expect(contactModel.setOptOut).toHaveBeenCalledWith(fakes.ctx.db, 'ct1', null)
  })

  it('clears the opt-out', async () => {
    await handling.clearOptOut(fakes.ctx, 'ct1')
    expect(contactModel.clearOptOut).toHaveBeenCalledWith(fakes.ctx.db, 'ct1')
  })

  it('404s for an unknown contact', async () => {
    vi.mocked(contactModel.findById).mockResolvedValue(null)
    await expect(handling.setOptOut(fakes.ctx, null, 'nope')).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
})
