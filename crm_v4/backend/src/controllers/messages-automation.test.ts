import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as contactModel from '../models/contact.js'
import * as conversationModel from '../models/conversation.js'
import * as messageModel from '../models/message.js'
import type { User } from '../models/user.js'
import { fakeContext } from '../test/context.js'
import * as triggers from './automation/triggers.js'
import * as connection from './connection.js'
import * as handling from './handling.js'
import * as messages from './messages.js'

// Feature 003 hooks in the messages controller: triggers on receive, take-over on attendant send,
// and sendAutomated for flows and agents.

vi.mock('../models/contact.js')
vi.mock('../models/conversation.js')
vi.mock('../models/message.js')
vi.mock('./automation/triggers.js')
vi.mock('./connection.js')
vi.mock('./handling.js')
vi.mock('./leads.js')

const now = new Date('2026-09-22T12:00:00Z')
const contact = {
  id: 'ct1',
  waJid: '5511@s.whatsapp.net',
  phone: '5511',
  name: 'Cliente',
  avatarUrl: null,
  automationOptOutAt: null,
  automationOptOutByUserId: null,
  createdAt: now,
  updatedAt: now,
}
const conversation = (assumedByUserId: string | null = null): conversationModel.ConversationWithContact => ({
  id: 'cv1',
  contactId: 'ct1',
  lastMessageAt: now,
  lastMessagePreview: 'oi',
  unreadCount: 0,
  handlingMode: assumedByUserId ? 'human' : 'automation',
  handoffReason: null,
  handoffSummary: null,
  handoffAt: null,
  assumedByUserId,
  createdAt: now,
  updatedAt: now,
  contact,
})
const message = (overrides: Partial<messageModel.MessageWithSender> = {}): messageModel.MessageWithSender => ({
  id: 'm1',
  conversationId: 'cv1',
  waMessageId: null,
  direction: 'outbound',
  type: 'text',
  body: 'oi',
  mediaPath: null,
  mediaMime: null,
  mediaFilename: null,
  mediaSize: null,
  status: 'pending',
  sentByUserId: null,
  flowRunId: 'r1',
  aiAgentId: null,
  sentAt: now,
  error: null,
  createdAt: now,
  updatedAt: now,
  sentBy: null,
  ...overrides,
})
const user = { id: 'u1', name: 'Bia', email: 'b@x.com', role: 'attendant', status: 'active', createdAt: now, updatedAt: now } as User
const upsert = (fromMe: boolean) => ({
  key: { remoteJid: '5511@s.whatsapp.net', fromMe, id: 'WA1' },
  pushName: 'Cliente',
  message: { conversation: 'oi' },
  messageType: 'conversation',
  messageTimestamp: now.getTime() / 1000,
})
const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

let fakes: ReturnType<typeof fakeContext>

beforeEach(() => {
  vi.resetAllMocks()
  fakes = fakeContext()
  vi.mocked(contactModel.upsertByJid).mockResolvedValue({ contact, created: false })
  vi.mocked(conversationModel.getOrCreateForContact).mockResolvedValue(conversation())
  vi.mocked(conversationModel.findById).mockResolvedValue(conversation())
  vi.mocked(messageModel.hasOtherInbound).mockResolvedValue(true)
  vi.mocked(connection.isConnected).mockResolvedValue(true)
  vi.mocked(triggers.onInboundMessage).mockResolvedValue(undefined)
  vi.mocked(messageModel.insertPending).mockImplementation(async (_db, input) => message({ ...input, body: input.body ?? null }))
  vi.mocked(messageModel.setMedia).mockImplementation(async (_db, _id, media) => message({ ...media, type: 'document' }))
  vi.mocked(messageModel.markSent).mockImplementation(async () => message({ status: 'sent', waMessageId: 'WA9' }))
  fakes.evolution.sendText.mockResolvedValue({ waMessageId: 'WA9' })
})

describe('receive → automation', () => {
  it('hands new inbound messages to the triggers without waiting for them', async () => {
    let finish = () => {}
    vi.mocked(triggers.onInboundMessage).mockReturnValue(new Promise<void>((resolve) => (finish = resolve)))
    vi.mocked(messageModel.insertFromWhatsApp).mockResolvedValue({ message: message({ direction: 'inbound', status: null }), created: true })
    await messages.receive(fakes.ctx, upsert(false))
    await flush()
    expect(triggers.onInboundMessage).toHaveBeenCalledWith(fakes.ctx, expect.objectContaining({ contact, message: expect.objectContaining({ id: 'm1' }) }))
    finish()
  })

  it('does not trigger for messages sent from the phone or re-deliveries', async () => {
    vi.mocked(messageModel.insertFromWhatsApp).mockResolvedValue({ message: message(), created: true })
    await messages.receive(fakes.ctx, upsert(true))
    vi.mocked(messageModel.insertFromWhatsApp).mockResolvedValue({ message: message({ direction: 'inbound' }), created: false })
    await messages.receive(fakes.ctx, upsert(false))
    await flush()
    expect(triggers.onInboundMessage).not.toHaveBeenCalled()
  })

  it('logs trigger failures instead of failing the webhook', async () => {
    vi.mocked(triggers.onInboundMessage).mockRejectedValue(new Error('boom'))
    vi.mocked(messageModel.insertFromWhatsApp).mockResolvedValue({ message: message({ direction: 'inbound', status: null }), created: true })
    await expect(messages.receive(fakes.ctx, upsert(false))).resolves.toBeUndefined()
    await flush()
    expect(fakes.log.error).toHaveBeenCalledWith(expect.objectContaining({ conversationId: 'cv1' }), 'automation trigger failed')
  })
})

describe('attendant send takes the conversation over', () => {
  it('assumes an unassigned conversation before sending', async () => {
    await messages.sendText(fakes.ctx, user, 'cv1', 'Olá')
    expect(handling.assume).toHaveBeenCalledWith(fakes.ctx, user, 'cv1')
  })

  it('keeps the current assignee', async () => {
    vi.mocked(conversationModel.findById).mockResolvedValue(conversation('u2'))
    await messages.sendText(fakes.ctx, user, 'cv1', 'Olá')
    expect(handling.assume).not.toHaveBeenCalled()
  })
})

describe('sendAutomated', () => {
  it('sends text credited to the run and agent, without taking the conversation over', async () => {
    const dto = await messages.sendAutomated(fakes.ctx, 'cv1', { text: 'Oi!' }, { flowRunId: 'r1', aiAgentId: 'a1' })
    expect(messageModel.insertPending).toHaveBeenCalledWith(fakes.ctx.db, {
      conversationId: 'cv1',
      flowRunId: 'r1',
      aiAgentId: 'a1',
      type: 'text',
      body: 'Oi!',
    })
    expect(fakes.evolution.sendText).toHaveBeenCalledWith('5511', 'Oi!')
    expect(handling.assume).not.toHaveBeenCalled()
    expect(dto.status).toBe('sent')
  })

  it('stores flow media as a pending document pointing at the asset', async () => {
    fakes.storage.get.mockResolvedValue(
      (async function* () {
        yield Buffer.from('pdf')
      })(),
    )
    fakes.evolution.sendMedia.mockResolvedValue({ waMessageId: 'WA9' })
    await messages.sendAutomated(
      fakes.ctx,
      'cv1',
      { media: { mediaPath: 'automation/x/tabela.pdf', mime: 'application/pdf', filename: 'tabela.pdf', caption: 'Segue' } },
      { flowRunId: 'r1' },
    )
    expect(messageModel.insertPending).toHaveBeenCalledWith(fakes.ctx.db, expect.objectContaining({ type: 'document', body: 'Segue', flowRunId: 'r1' }))
    expect(messageModel.setMedia).toHaveBeenCalledWith(fakes.ctx.db, 'm1', expect.objectContaining({ mediaPath: 'automation/x/tabela.pdf' }))
  })

  it('throws WHATSAPP_DISCONNECTED when the number is offline', async () => {
    vi.mocked(connection.isConnected).mockResolvedValue(false)
    await expect(messages.sendAutomated(fakes.ctx, 'cv1', { text: 'x' }, { flowRunId: 'r1' })).rejects.toMatchObject({
      code: 'WHATSAPP_DISCONNECTED',
    })
  })
})
