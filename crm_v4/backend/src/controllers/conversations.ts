import type { AppContext } from '../context.js'
import { notFound } from '../lib/errors.js'
import * as conversationModel from '../models/conversation.js'
import * as messageModel from '../models/message.js'
import { toConversationDto, toMessageDto } from './dto.js'

export async function list(
  ctx: AppContext,
  query: { cursor?: string; limit: number; search?: string; unread?: boolean; handling?: 'awaiting_human' },
) {
  const page = await conversationModel.list(ctx.db, query)
  return { items: page.items.map(toConversationDto), nextCursor: page.nextCursor }
}

export async function listMessages(ctx: AppContext, conversationId: string, query: { cursor?: string; limit: number }) {
  if (!(await conversationModel.findById(ctx.db, conversationId))) throw notFound('Conversa não encontrada.')
  const page = await messageModel.listByConversation(ctx.db, conversationId, query)
  return { items: page.items.map(toMessageDto), nextCursor: page.nextCursor }
}

export async function markRead(ctx: AppContext, conversationId: string): Promise<void> {
  const conversation = await conversationModel.findById(ctx.db, conversationId)
  if (!conversation) throw notFound('Conversa não encontrada.')
  if (conversation.unreadCount > 0) {
    await conversationModel.markRead(ctx.db, conversationId)
    ctx.bus.publish({
      type: 'conversation.updated',
      data: { conversation: toConversationDto({ ...conversation, unreadCount: 0 }) },
    })
  }

  // Read receipt to the contact; best effort, never blocks the attendant.
  const latest = await messageModel.latestInbound(ctx.db, conversationId)
  if (!latest?.waMessageId) return
  try {
    await ctx.evolution.markAsRead(conversation.contact.waJid, latest.waMessageId)
  } catch (error) {
    ctx.log.warn({ err: error, conversationId }, 'read receipt failed')
  }
}
