import { beforeEach, describe, expect, it } from 'vitest'
import type { Db } from '../db/client.js'
import { createTestDb } from '../test/db.js'
import * as contactModel from './contact.js'
import * as conversationModel from './conversation.js'

let db: Db
beforeEach(async () => {
  db = await createTestDb()
})

async function conversationFor(phone: string, name: string | null, at?: string) {
  const { contact } = await contactModel.upsertByJid(db, { waJid: `${phone}@s.whatsapp.net`, name })
  const conversation = await conversationModel.getOrCreateForContact(db, contact.id)
  if (at) await conversationModel.touch(db, conversation.id, { at: new Date(at), preview: `msg ${name}`, incrementUnread: false })
  return conversation
}

describe('conversation model', () => {
  it('gets or creates one conversation per contact', async () => {
    const first = await conversationFor('5511', 'Ana')
    const { contact } = await contactModel.upsertByJid(db, { waJid: '5511@s.whatsapp.net', name: null })
    const again = await conversationModel.getOrCreateForContact(db, contact.id)
    expect(again.id).toBe(first.id)
  })

  it('lists by latest message first, with contact, paginated by cursor', async () => {
    await conversationFor('551', 'Antiga', '2026-09-20T10:00:00Z')
    await conversationFor('552', 'Recente', '2026-09-22T10:00:00Z')
    await conversationFor('553', 'Meio', '2026-09-21T10:00:00Z')

    const first = await conversationModel.list(db, { limit: 2 })
    expect(first.items.map((c) => c.contact.name)).toEqual(['Recente', 'Meio'])
    expect(first.nextCursor).not.toBeNull()

    const second = await conversationModel.list(db, { limit: 2, cursor: first.nextCursor! })
    expect(second.items.map((c) => c.contact.name)).toEqual(['Antiga'])
    expect(second.nextCursor).toBeNull()
  })

  it('touch updates preview and time, truncates to 120 chars, and increments unread', async () => {
    const conversation = await conversationFor('5511', 'Ana')

    await conversationModel.touch(db, conversation.id, { at: new Date('2026-09-22T10:00:00Z'), preview: 'x'.repeat(200), incrementUnread: true })
    await conversationModel.touch(db, conversation.id, { at: new Date('2026-09-22T10:01:00Z'), preview: 'oi', incrementUnread: true })

    const found = await conversationModel.findById(db, conversation.id)
    expect(found).toMatchObject({ lastMessagePreview: 'oi', unreadCount: 2, contact: { name: 'Ana' } })
  })

  it('does not move back in time when an older message arrives late', async () => {
    const conversation = await conversationFor('5511', 'Ana')
    await conversationModel.touch(db, conversation.id, { at: new Date('2026-09-22T10:05:00Z'), preview: 'nova', incrementUnread: false })
    await conversationModel.touch(db, conversation.id, { at: new Date('2026-09-22T10:00:00Z'), preview: 'velha', incrementUnread: false })

    const found = await conversationModel.findById(db, conversation.id)
    expect(found?.lastMessagePreview).toBe('nova')
    expect(found?.lastMessageAt?.toISOString()).toBe('2026-09-22T10:05:00.000Z')
  })

  it('truncates long previews', async () => {
    const conversation = await conversationFor('5511', 'Ana')
    await conversationModel.touch(db, conversation.id, { at: new Date(), preview: 'y'.repeat(300), incrementUnread: false })
    const found = await conversationModel.findById(db, conversation.id)
    expect(found?.lastMessagePreview).toHaveLength(120)
  })

  it('markRead zeroes the unread count', async () => {
    const conversation = await conversationFor('5511', 'Ana')
    await conversationModel.touch(db, conversation.id, { at: new Date(), preview: 'oi', incrementUnread: true })
    await conversationModel.markRead(db, conversation.id)
    expect((await conversationModel.findById(db, conversation.id))?.unreadCount).toBe(0)
  })

  it('searches name or phone case-insensitively and filters unread', async () => {
    const ana = await conversationFor('5511987654321', 'Ana Souza', '2026-09-22T10:00:00Z')
    await conversationFor('5521912345678', 'Bruno', '2026-09-22T09:00:00Z')
    await conversationModel.touch(db, ana.id, { at: new Date('2026-09-22T10:00:00Z'), preview: 'oi', incrementUnread: true })

    expect((await conversationModel.list(db, { limit: 10, search: 'souza' })).items.map((c) => c.contact.name)).toEqual(['Ana Souza'])
    expect((await conversationModel.list(db, { limit: 10, search: '2191234' })).items.map((c) => c.contact.name)).toEqual(['Bruno'])
    expect((await conversationModel.list(db, { limit: 10, search: '100%' })).items).toEqual([])
    expect((await conversationModel.list(db, { limit: 10, unread: true })).items.map((c) => c.contact.name)).toEqual(['Ana Souza'])
  })

  it('returns null for an unknown id', async () => {
    expect(await conversationModel.findById(db, '00000000-0000-0000-0000-000000000000')).toBeNull()
  })
})
