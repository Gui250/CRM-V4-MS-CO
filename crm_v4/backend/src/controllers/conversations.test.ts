import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ContactRow, MessageRow } from '../db/schema.js'
import * as conversationModel from '../models/conversation.js'
import * as messageModel from '../models/message.js'
import { fakeContext } from '../test/context.js'
import * as conversations from './conversations.js'

vi.mock('../models/conversation.js')
vi.mock('../models/message.js')

const now = new Date('2026-09-22T12:00:00Z')
const contact: ContactRow = { id: 'ct1', waJid: '5511@s.whatsapp.net', phone: '5511', name: 'Cliente', avatarUrl: null, automationOptOutAt: null, automationOptOutByUserId: null, createdAt: now, updatedAt: now }
const conversation = (unreadCount: number): conversationModel.ConversationWithContact => ({
  id: 'cv1',
  contactId: 'ct1',
  lastMessageAt: now,
  lastMessagePreview: 'oi',
  unreadCount,
  handlingMode: 'automation',
  handoffReason: null,
  handoffSummary: null,
  handoffAt: null,
  assumedByUserId: null,
  createdAt: now,
  updatedAt: now,
  contact,
})

let fakes: ReturnType<typeof fakeContext>
beforeEach(() => {
  vi.resetAllMocks()
  fakes = fakeContext()
})

describe('conversations controller', () => {
  it('lists conversations as DTOs with the cursor', async () => {
    vi.mocked(conversationModel.list).mockResolvedValue({ items: [conversation(2)], nextCursor: 'next' })

    const result = await conversations.list(fakes.ctx, { limit: 50, search: 'cli' })

    expect(conversationModel.list).toHaveBeenCalledWith(fakes.ctx.db, { limit: 50, search: 'cli' })
    expect(result).toEqual({
      items: [
        {
          id: 'cv1',
          contact: { id: 'ct1', phone: '5511', name: 'Cliente', avatarUrl: null },
          lastMessageAt: now.toISOString(),
          lastMessagePreview: 'oi',
          unreadCount: 2,
          handling: { mode: 'automation', reason: null, summary: null, handoffAt: null, assumedBy: null },
          automationOptOut: false,
        },
      ],
      nextCursor: 'next',
    })
  })

  it('lists messages of a conversation, 404 when unknown', async () => {
    vi.mocked(conversationModel.findById).mockResolvedValue(conversation(0))
    vi.mocked(messageModel.listByConversation).mockResolvedValue({ items: [], nextCursor: null })
    expect(await conversations.listMessages(fakes.ctx, 'cv1', { limit: 50 })).toEqual({ items: [], nextCursor: null })

    vi.mocked(conversationModel.findById).mockResolvedValue(null)
    await expect(conversations.listMessages(fakes.ctx, 'x', { limit: 50 })).rejects.toMatchObject({ httpStatus: 404 })
  })

  it('markRead zeroes unread, publishes and sends a read receipt for the latest inbound message', async () => {
    vi.mocked(conversationModel.findById).mockResolvedValue(conversation(3))
    vi.mocked(messageModel.latestInbound).mockResolvedValue({ waMessageId: 'WA7' } as MessageRow)

    await conversations.markRead(fakes.ctx, 'cv1')

    expect(conversationModel.markRead).toHaveBeenCalledWith(fakes.ctx.db, 'cv1')
    expect(fakes.bus.publish).toHaveBeenCalledWith({ type: 'conversation.updated', data: { conversation: expect.objectContaining({ unreadCount: 0 }) } })
    expect(fakes.evolution.markAsRead).toHaveBeenCalledWith('5511@s.whatsapp.net', 'WA7')
  })

  it('skips the update when already read and never fails on receipt errors', async () => {
    vi.mocked(conversationModel.findById).mockResolvedValue(conversation(0))
    vi.mocked(messageModel.latestInbound).mockResolvedValue({ waMessageId: 'WA7' } as MessageRow)
    fakes.evolution.markAsRead.mockRejectedValue(new Error('down'))

    await expect(conversations.markRead(fakes.ctx, 'cv1')).resolves.toBeUndefined()
    expect(conversationModel.markRead).not.toHaveBeenCalled()
    expect(fakes.log.warn).toHaveBeenCalled()
  })

  it('markRead returns 404 for unknown conversations', async () => {
    vi.mocked(conversationModel.findById).mockResolvedValue(null)
    await expect(conversations.markRead(fakes.ctx, 'x')).rejects.toMatchObject({ httpStatus: 404 })
  })
})
