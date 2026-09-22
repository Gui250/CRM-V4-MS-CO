import { beforeEach, describe, expect, it } from 'vitest'
import type { Db } from '../db/client.js'
import { createTestDb } from '../test/db.js'
import * as contactModel from './contact.js'
import * as conversationModel from './conversation.js'
import * as messageModel from './message.js'
import * as userModel from './user.js'

let db: Db
let conversationId: string
let userId: string

beforeEach(async () => {
  db = await createTestDb()
  const { contact } = await contactModel.upsertByJid(db, { waJid: '5511@s.whatsapp.net', name: 'Cliente' })
  conversationId = (await conversationModel.getOrCreateForContact(db, contact.id)).id
  userId = (await userModel.create(db, { name: 'Ana', email: 'a@x.com', passwordHash: 'h', role: 'admin', status: 'active' })).id
})

const inbound = (waMessageId: string, sentAt = new Date()) =>
  messageModel.insertFromWhatsApp(db, { conversationId, waMessageId, direction: 'inbound', type: 'text', body: 'oi', sentAt })

describe('message model', () => {
  it('inserts WhatsApp messages idempotently by wa_message_id', async () => {
    const first = await inbound('WA1')
    const again = await inbound('WA1')

    expect(first.created).toBe(true)
    expect(first.message.status).toBeNull()
    expect(again.created).toBe(false)
    expect(again.message.id).toBe(first.message.id)
  })

  it('stores outbound messages from the phone as sent without a sender', async () => {
    const { message } = await messageModel.insertFromWhatsApp(db, { conversationId, waMessageId: 'WA2', direction: 'outbound', type: 'text', body: 'do celular' })
    expect(message).toMatchObject({ status: 'sent', sentBy: null })
  })

  it('creates pending panel messages with the sender, then marks them sent', async () => {
    const pending = await messageModel.insertPending(db, { conversationId, type: 'text', body: 'olá', sentByUserId: userId })
    expect(pending).toMatchObject({ status: 'pending', waMessageId: null, sentBy: { id: userId, name: 'Ana' } })

    const sent = await messageModel.markSent(db, pending.id, 'WA3')
    expect(sent).toMatchObject({ status: 'sent', waMessageId: 'WA3' })
  })

  it('merges into the webhook row when it arrived before markSent', async () => {
    const pending = await messageModel.insertPending(db, { conversationId, type: 'text', body: 'olá', sentByUserId: userId })
    const { message: fromWebhook } = await messageModel.insertFromWhatsApp(db, { conversationId, waMessageId: 'WA4', direction: 'outbound', type: 'text', body: 'olá' })

    const result = await messageModel.markSent(db, pending.id, 'WA4')

    expect(result.id).toBe(fromWebhook.id)
    expect(result.sentBy).toEqual({ id: userId, name: 'Ana' })
    expect(await messageModel.findById(db, pending.id)).toBeNull()
  })

  it('advances status forward only', async () => {
    const pending = await messageModel.insertPending(db, { conversationId, type: 'text', body: 'x', sentByUserId: userId })
    await messageModel.markSent(db, pending.id, 'WA5')

    expect((await messageModel.advanceStatus(db, 'WA5', 'read'))?.status).toBe('read')
    expect(await messageModel.advanceStatus(db, 'WA5', 'delivered')).toBeNull()
    expect((await messageModel.findById(db, pending.id))?.status).toBe('read')
    expect(await messageModel.advanceStatus(db, 'desconhecida', 'read')).toBeNull()
  })

  it('never sets a status on inbound messages', async () => {
    await inbound('WA6')
    expect(await messageModel.advanceStatus(db, 'WA6', 'read')).toBeNull()
  })

  it('marks failed from pending, and resets for retry only from failed', async () => {
    const pending = await messageModel.insertPending(db, { conversationId, type: 'text', body: 'x', sentByUserId: userId })
    expect(await messageModel.resetForRetry(db, pending.id)).toBeNull()

    const failed = await messageModel.markFailed(db, pending.id, 'WhatsApp indisponível')
    expect(failed).toMatchObject({ status: 'failed', error: 'WhatsApp indisponível' })

    expect(await messageModel.resetForRetry(db, pending.id)).toMatchObject({ status: 'pending', error: null })
  })

  it('lists newest first with cursor pagination', async () => {
    for (let i = 1; i <= 5; i++) await inbound(`L${i}`, new Date(`2026-09-22T10:0${i}:00Z`))

    const first = await messageModel.listByConversation(db, conversationId, { limit: 3 })
    expect(first.items.map((m) => m.waMessageId)).toEqual(['L5', 'L4', 'L3'])

    const second = await messageModel.listByConversation(db, conversationId, { limit: 3, cursor: first.nextCursor! })
    expect(second.items.map((m) => m.waMessageId)).toEqual(['L2', 'L1'])
    expect(second.nextCursor).toBeNull()
  })

  it('stores media metadata and finds the latest inbound message', async () => {
    await inbound('M1', new Date('2026-09-22T10:00:00Z'))
    const { message } = await inbound('M2', new Date('2026-09-22T11:00:00Z'))

    const withMedia = await messageModel.setMedia(db, message.id, { mediaPath: 'media/x', mediaMime: 'image/jpeg', mediaFilename: 'a.jpg', mediaSize: 10 })
    expect(withMedia).toMatchObject({ mediaPath: 'media/x', mediaSize: 10 })
    expect((await messageModel.latestInbound(db, conversationId))?.waMessageId).toBe('M2')
  })

  it('rejects an inbound message with a status (database check)', async () => {
    const { messages } = await import('../db/schema.js')
    await expect(db.insert(messages).values({ conversationId, direction: 'inbound', type: 'text', status: 'sent' })).rejects.toThrow()
  })

  it('tells whether the conversation has another inbound message (first-contact detection)', async () => {
    const first = await inbound('WA1')
    expect(await messageModel.hasOtherInbound(db, conversationId, first.message.id)).toBe(false)

    await messageModel.insertFromWhatsApp(db, { conversationId, waMessageId: 'OUT', direction: 'outbound', type: 'text', body: 'olá' })
    expect(await messageModel.hasOtherInbound(db, conversationId, first.message.id)).toBe(false)

    const second = await inbound('WA2')
    expect(await messageModel.hasOtherInbound(db, conversationId, second.message.id)).toBe(true)
  })
})
