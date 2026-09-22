import { Readable } from 'node:stream'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ContactRow, ConversationRow } from '../db/schema.js'
import * as contactModel from '../models/contact.js'
import * as conversationModel from '../models/conversation.js'
import * as messageModel from '../models/message.js'
import type { User } from '../models/user.js'
import { fakeContext } from '../test/context.js'
import * as connection from './connection.js'
import * as leads from './leads.js'
import * as messages from './messages.js'

vi.mock('../models/contact.js')
vi.mock('../models/conversation.js')
vi.mock('../models/message.js')
vi.mock('./handling.js')
vi.mock('./automation/triggers.js')
vi.mock('./connection.js')
vi.mock('./leads.js')

const now = new Date('2026-09-22T12:00:00Z')
const contact: ContactRow = { id: 'ct1', waJid: '5511@s.whatsapp.net', phone: '5511', name: 'Cliente', avatarUrl: null, automationOptOutAt: null, automationOptOutByUserId: null, createdAt: now, updatedAt: now }
const conversation: ConversationRow & { contact: ContactRow } = {
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
}
const user: User = { id: 'u1', name: 'Ana', email: 'a@x.com', role: 'attendant', status: 'active', createdAt: now, updatedAt: now }

const message = (overrides: Partial<messageModel.MessageWithSender> = {}): messageModel.MessageWithSender => ({
  id: 'm1',
  conversationId: 'cv1',
  waMessageId: 'WA1',
  direction: 'inbound',
  type: 'text',
  body: 'oi',
  mediaPath: null,
  mediaMime: null,
  mediaFilename: null,
  mediaSize: null,
  status: null,
  sentByUserId: null,
  sentAt: now,
  error: null,
  flowRunId: null,
  aiAgentId: null,
  createdAt: now,
  updatedAt: now,
  sentBy: null,
  ...overrides,
})

const upsert = (overrides: Record<string, unknown> = {}) => ({
  key: { remoteJid: '5511@s.whatsapp.net', fromMe: false, id: 'WA1' },
  pushName: 'Cliente',
  message: { conversation: 'oi' },
  messageType: 'conversation',
  messageTimestamp: now.getTime() / 1000,
  ...overrides,
})

let fakes: ReturnType<typeof fakeContext>

beforeEach(() => {
  vi.resetAllMocks()
  fakes = fakeContext()
  vi.mocked(contactModel.upsertByJid).mockResolvedValue({ contact, created: false })
  vi.mocked(conversationModel.getOrCreateForContact).mockResolvedValue(conversation)
  vi.mocked(conversationModel.findById).mockResolvedValue(conversation)
  vi.mocked(messageModel.insertFromWhatsApp).mockResolvedValue({ message: message(), created: true })
  vi.mocked(connection.isConnected).mockResolvedValue(true)
})

const published = (type: string) => fakes.bus.publish.mock.calls.filter(([event]) => event.type === type)

describe('receive: lead entry (feature 002)', () => {
  it('enters the contact in the entry pipeline on the first inbound message of the conversation', async () => {
    vi.mocked(messageModel.hasOtherInbound).mockResolvedValue(false)
    await messages.receive(fakes.ctx, upsert())
    expect(messageModel.hasOtherInbound).toHaveBeenCalledWith(fakes.ctx.db, 'cv1', 'm1')
    expect(leads.enterFromWhatsApp).toHaveBeenCalledWith(fakes.ctx, 'ct1')
  })

  it('does not enter on later inbound messages, outbound messages, re-deliveries or groups', async () => {
    vi.mocked(messageModel.hasOtherInbound).mockResolvedValue(true)
    await messages.receive(fakes.ctx, upsert())

    vi.mocked(messageModel.hasOtherInbound).mockResolvedValue(false)
    vi.mocked(messageModel.insertFromWhatsApp).mockResolvedValue({ message: message({ direction: 'outbound' }), created: true })
    await messages.receive(fakes.ctx, upsert({ key: { remoteJid: '5511@s.whatsapp.net', fromMe: true, id: 'WA2' } }))

    vi.mocked(messageModel.insertFromWhatsApp).mockResolvedValue({ message: message(), created: false })
    await messages.receive(fakes.ctx, upsert())
    await messages.receive(fakes.ctx, upsert({ key: { remoteJid: '1203@g.us', fromMe: false, id: 'G1' } }))

    expect(leads.enterFromWhatsApp).not.toHaveBeenCalled()
  })
})

describe('receive', () => {
  it('stores an inbound text, bumps the conversation with +1 unread and publishes message.created', async () => {
    await messages.receive(fakes.ctx, upsert())

    expect(contactModel.upsertByJid).toHaveBeenCalledWith(fakes.ctx.db, { waJid: '5511@s.whatsapp.net', name: 'Cliente' })
    expect(messageModel.insertFromWhatsApp).toHaveBeenCalledWith(
      fakes.ctx.db,
      expect.objectContaining({ direction: 'inbound', type: 'text', body: 'oi', waMessageId: 'WA1', sentAt: now }),
    )
    expect(conversationModel.touch).toHaveBeenCalledWith(fakes.ctx.db, 'cv1', { at: now, preview: 'oi', incrementUnread: true })
    expect(published('message.created')).toHaveLength(1)
  })

  it('does nothing more for a re-delivered webhook', async () => {
    vi.mocked(messageModel.insertFromWhatsApp).mockResolvedValue({ message: message(), created: false })
    await messages.receive(fakes.ctx, upsert())
    expect(conversationModel.touch).not.toHaveBeenCalled()
    expect(fakes.bus.publish).not.toHaveBeenCalled()
  })

  it('ignores group messages', async () => {
    await messages.receive(fakes.ctx, upsert({ key: { remoteJid: '1203@g.us', fromMe: false, id: 'G1' } }))
    expect(contactModel.upsertByJid).not.toHaveBeenCalled()
  })

  it('stores messages sent from the phone as outbound, without unread and without renaming the contact', async () => {
    await messages.receive(fakes.ctx, upsert({ key: { remoteJid: '5511@s.whatsapp.net', fromMe: true, id: 'WA2' }, pushName: 'Eu' }))

    expect(contactModel.upsertByJid).toHaveBeenCalledWith(fakes.ctx.db, { waJid: '5511@s.whatsapp.net', name: null })
    expect(messageModel.insertFromWhatsApp).toHaveBeenCalledWith(fakes.ctx.db, expect.objectContaining({ direction: 'outbound' }))
    expect(conversationModel.touch).toHaveBeenCalledWith(fakes.ctx.db, 'cv1', expect.objectContaining({ incrementUnread: false }))
  })

  it('fetches the profile picture only for new contacts, tolerating failures', async () => {
    vi.mocked(contactModel.upsertByJid).mockResolvedValue({ contact, created: true })
    fakes.evolution.fetchProfilePictureUrl.mockResolvedValue('https://pps/a.jpg')
    await messages.receive(fakes.ctx, upsert())
    expect(contactModel.setAvatar).toHaveBeenCalledWith(fakes.ctx.db, 'ct1', 'https://pps/a.jpg')

    fakes.evolution.fetchProfilePictureUrl.mockRejectedValue(new Error('down'))
    await expect(messages.receive(fakes.ctx, upsert())).resolves.toBeUndefined()

    vi.mocked(contactModel.upsertByJid).mockResolvedValue({ contact, created: false })
    fakes.evolution.fetchProfilePictureUrl.mockClear()
    await messages.receive(fakes.ctx, upsert())
    expect(fakes.evolution.fetchProfilePictureUrl).not.toHaveBeenCalled()
  })

  it('downloads inbound media into storage and publishes message.updated', async () => {
    const image = message({ type: 'image', body: null })
    vi.mocked(messageModel.insertFromWhatsApp).mockResolvedValue({ message: image, created: true })
    vi.mocked(messageModel.setMedia).mockResolvedValue({ ...image, mediaPath: 'media/2026/09/m1' })
    fakes.evolution.getMediaBase64.mockResolvedValue({ base64: Buffer.from('JPEG').toString('base64'), mimetype: 'image/jpeg', fileName: null })

    await messages.receive(fakes.ctx, upsert({ messageType: 'imageMessage', message: { imageMessage: { mimetype: 'image/jpeg' } } }))

    expect(fakes.storage.put).toHaveBeenCalledWith('media/2026/09/m1', Buffer.from('JPEG'), 'image/jpeg')
    expect(messageModel.setMedia).toHaveBeenCalledWith(fakes.ctx.db, 'm1', { mediaPath: 'media/2026/09/m1', mediaMime: 'image/jpeg', mediaFilename: null, mediaSize: 4 })
    expect(published('message.updated')).toHaveLength(1)
  })

  it('keeps the message when the media download fails', async () => {
    vi.mocked(messageModel.insertFromWhatsApp).mockResolvedValue({ message: message({ type: 'audio' }), created: true })
    fakes.evolution.getMediaBase64.mockRejectedValue(new Error('down'))

    await expect(messages.receive(fakes.ctx, upsert({ messageType: 'audioMessage' }))).resolves.toBeUndefined()
    expect(messageModel.setMedia).not.toHaveBeenCalled()
    expect(fakes.log.warn).toHaveBeenCalled()
  })
})

describe('updateStatus', () => {
  it('advances the status and publishes', async () => {
    vi.mocked(messageModel.advanceStatus).mockResolvedValue(message({ direction: 'outbound', status: 'read' }))
    await messages.updateStatus(fakes.ctx, 'WA1', 'READ')
    expect(messageModel.advanceStatus).toHaveBeenCalledWith(fakes.ctx.db, 'WA1', 'read')
    expect(published('message.updated')).toHaveLength(1)
  })

  it('ignores unknown statuses and non-advancing updates', async () => {
    await messages.updateStatus(fakes.ctx, 'WA1', 'PENDING')
    expect(messageModel.advanceStatus).not.toHaveBeenCalled()

    vi.mocked(messageModel.advanceStatus).mockResolvedValue(null)
    await messages.updateStatus(fakes.ctx, 'WA1', 'DELIVERY_ACK')
    expect(fakes.bus.publish).not.toHaveBeenCalled()
  })
})

describe('sendText', () => {
  const pending = message({ id: 'p1', waMessageId: null, direction: 'outbound', status: 'pending', body: 'olá', sentByUserId: 'u1', sentBy: { id: 'u1', name: 'Ana' } })

  beforeEach(() => {
    vi.mocked(messageModel.insertPending).mockResolvedValue(pending)
  })

  it('inserts pending with the sender, publishes, sends and marks sent', async () => {
    fakes.evolution.sendText.mockResolvedValue({ waMessageId: 'WA9' })
    vi.mocked(messageModel.markSent).mockResolvedValue({ ...pending, status: 'sent', waMessageId: 'WA9' })

    const result = await messages.sendText(fakes.ctx, user, 'cv1', '  olá  ')

    expect(messageModel.insertPending).toHaveBeenCalledWith(fakes.ctx.db, { conversationId: 'cv1', type: 'text', body: 'olá', sentByUserId: 'u1' })
    expect(fakes.evolution.sendText).toHaveBeenCalledWith('5511', 'olá')
    expect(messageModel.markSent).toHaveBeenCalledWith(fakes.ctx.db, 'p1', 'WA9')
    expect(result).toMatchObject({ status: 'sent', sentBy: { name: 'Ana' } })
    expect(published('message.created')).toHaveLength(1)
    expect(published('message.updated')).toHaveLength(1)
  })

  it('marks the message failed when WhatsApp rejects it', async () => {
    fakes.evolution.sendText.mockRejectedValue(new Error('down'))
    vi.mocked(messageModel.markFailed).mockResolvedValue({ ...pending, status: 'failed', error: 'x' })

    const result = await messages.sendText(fakes.ctx, user, 'cv1', 'olá')

    expect(messageModel.markFailed).toHaveBeenCalledWith(fakes.ctx.db, 'p1', expect.stringContaining('reenviar'))
    expect(result.status).toBe('failed')
  })

  it('refuses when disconnected, for unknown conversations, and for empty or too-long text', async () => {
    vi.mocked(connection.isConnected).mockResolvedValue(false)
    await expect(messages.sendText(fakes.ctx, user, 'cv1', 'olá')).rejects.toMatchObject({ code: 'WHATSAPP_DISCONNECTED', httpStatus: 409 })

    vi.mocked(connection.isConnected).mockResolvedValue(true)
    await expect(messages.sendText(fakes.ctx, user, 'cv1', '   ')).rejects.toMatchObject({ httpStatus: 422 })
    await expect(messages.sendText(fakes.ctx, user, 'cv1', 'x'.repeat(4097))).rejects.toMatchObject({ httpStatus: 422 })

    vi.mocked(conversationModel.findById).mockResolvedValue(null)
    await expect(messages.sendText(fakes.ctx, user, 'nope', 'olá')).rejects.toMatchObject({ httpStatus: 404 })
    expect(messageModel.insertPending).not.toHaveBeenCalled()
  })
})

describe('retry', () => {
  it('resets a failed message and delivers it again', async () => {
    const failed = message({ id: 'f1', direction: 'outbound', status: 'failed', waMessageId: null })
    vi.mocked(messageModel.findById).mockResolvedValue(failed)
    vi.mocked(messageModel.resetForRetry).mockResolvedValue({ ...failed, status: 'pending' })
    fakes.evolution.sendText.mockResolvedValue({ waMessageId: 'WA10' })
    vi.mocked(messageModel.markSent).mockResolvedValue({ ...failed, status: 'sent' })

    expect((await messages.retry(fakes.ctx, 'f1')).status).toBe('sent')
  })

  it('refuses messages that are not failed, and unknown messages', async () => {
    vi.mocked(messageModel.findById).mockResolvedValue(message())
    vi.mocked(messageModel.resetForRetry).mockResolvedValue(null)
    await expect(messages.retry(fakes.ctx, 'm1')).rejects.toMatchObject({ code: 'NOT_RETRYABLE', httpStatus: 409 })

    vi.mocked(messageModel.findById).mockResolvedValue(null)
    await expect(messages.retry(fakes.ctx, 'x')).rejects.toMatchObject({ httpStatus: 404 })
  })
})

describe('sendMedia', () => {
  const file = (mime: string, size: number) => ({ data: Buffer.alloc(size), mime, filename: 'arquivo', caption: ' legenda ' })

  it('accepts images and documents within their limits', () => {
    expect(messages.classifyUpload('image/png', 1000)).toBe('image')
    expect(messages.classifyUpload('application/pdf', 50 * 1024 * 1024)).toBe('document')
  })

  it('rejects SVG and other scriptable images', () => {
    expect(() => messages.classifyUpload('image/svg+xml', 10)).toThrow(expect.objectContaining({ httpStatus: 415 }))
  })

  it('rejects unsupported types (415) and oversized files (413)', () => {
    expect(() => messages.classifyUpload('video/mp4', 10)).toThrow(expect.objectContaining({ httpStatus: 415 }))
    expect(() => messages.classifyUpload('image/jpeg', messages.IMAGE_MAX_BYTES + 1)).toThrow(expect.objectContaining({ httpStatus: 413 }))
    expect(() => messages.classifyUpload('application/pdf', messages.DOCUMENT_MAX_BYTES + 1)).toThrow(expect.objectContaining({ httpStatus: 413 }))
  })

  it('stores the upload, then sends it as base64 with the caption', async () => {
    const created = message({ id: 'd1', direction: 'outbound', status: 'pending', type: 'document', waMessageId: null })
    const withMedia = { ...created, mediaPath: 'media/2026/09/d1', mediaMime: 'application/pdf', mediaFilename: 'arquivo', body: 'legenda' }
    vi.mocked(messageModel.insertPending).mockResolvedValue(created)
    vi.mocked(messageModel.setMedia).mockResolvedValue(withMedia)
    fakes.storage.get.mockResolvedValue(Readable.from([Buffer.from('PDF')]))
    fakes.evolution.sendMedia.mockResolvedValue({ waMessageId: 'WA11' })
    vi.mocked(messageModel.markSent).mockResolvedValue({ ...withMedia, status: 'sent' })

    await messages.sendMedia(fakes.ctx, user, 'cv1', file('application/pdf', 3))

    expect(messageModel.insertPending).toHaveBeenCalledWith(fakes.ctx.db, expect.objectContaining({ type: 'document', body: 'legenda', mediaSize: 3 }))
    expect(fakes.storage.put).toHaveBeenCalledWith(expect.stringMatching(/^media\/\d{4}\/\d{2}\/d1$/), expect.any(Buffer), 'application/pdf')
    expect(fakes.evolution.sendMedia).toHaveBeenCalledWith(
      expect.objectContaining({ number: '5511', mediatype: 'document', base64: Buffer.from('PDF').toString('base64'), caption: 'legenda' }),
    )
  })
})

describe('getMedia', () => {
  it('streams stored media', async () => {
    const stream = Readable.from(['x'])
    vi.mocked(messageModel.findById).mockResolvedValue(message({ type: 'image', mediaPath: 'media/a', mediaMime: 'image/png' }))
    fakes.storage.get.mockResolvedValue(stream)
    expect(await messages.getMedia(fakes.ctx, 'm1')).toMatchObject({ stream, mime: 'image/png', type: 'image' })
  })

  it('retries the download when an inbound media was never saved', async () => {
    const pendingMedia = message({ type: 'image', mediaPath: null })
    vi.mocked(messageModel.findById).mockResolvedValue(pendingMedia)
    fakes.evolution.getMediaBase64.mockResolvedValue({ base64: 'QQ==', mimetype: 'image/png', fileName: null })
    vi.mocked(messageModel.setMedia).mockResolvedValue({ ...pendingMedia, mediaPath: 'media/x', mediaMime: 'image/png' })
    fakes.storage.get.mockResolvedValue(Readable.from(['x']))

    await messages.getMedia(fakes.ctx, 'm1')
    expect(fakes.evolution.getMediaBase64).toHaveBeenCalledWith('WA1')
  })

  it('returns 404 for text messages or missing files', async () => {
    vi.mocked(messageModel.findById).mockResolvedValue(message())
    await expect(messages.getMedia(fakes.ctx, 'm1')).rejects.toMatchObject({ httpStatus: 404 })

    vi.mocked(messageModel.findById).mockResolvedValue(message({ type: 'image', mediaPath: 'media/a' }))
    fakes.storage.get.mockResolvedValue(null)
    await expect(messages.getMedia(fakes.ctx, 'm1')).rejects.toMatchObject({ httpStatus: 404 })
  })
})
