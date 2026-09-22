import type { AppContext } from '../context.js'
import { notFound } from '../lib/errors.js'
import * as contactModel from '../models/contact.js'
import * as conversationModel from '../models/conversation.js'
import * as runModel from '../models/flow-run.js'
import * as messageModel from '../models/message.js'
import type { User } from '../models/user.js'
import { toRunSummaryDto } from './automation-dto.js'
import { toConversationDto } from './dto.js'

// Who is answering a conversation: automation or a human (FR-021..FR-025, FR-028).

export const FALLBACK_SUMMARY_MESSAGES = 5

const TYPE_LABELS: Record<string, string> = {
  image: '[imagem]',
  audio: '[áudio]',
  video: '[vídeo]',
  document: '[documento]',
  unsupported: '[mensagem não suportada]',
}

async function publishConversation(ctx: AppContext, conversationId: string) {
  const conversation = await conversationModel.findById(ctx.db, conversationId)
  if (!conversation) throw notFound('Conversa não encontrada.')
  const dto = toConversationDto(conversation)
  ctx.bus.publish({ type: 'conversation.updated', data: { conversation: dto } })
  return dto
}

/** Cancels the conversation's active run, if any, and tells the clients. */
export async function cancelActiveRun(ctx: AppContext, conversationId: string, endReason: runModel.RunEndReason) {
  const active = await runModel.findActiveByConversation(ctx.db, conversationId)
  if (!active) return
  const cancelled = await runModel.finish(ctx.db, active.id, { status: 'cancelled', endReason })
  if (cancelled) ctx.bus.publish({ type: 'run.updated', data: { run: toRunSummaryDto(cancelled) } })
}

/** Plain-text transcript of the last messages: the summary when there is no agent to write one. */
export async function recentTranscript(ctx: AppContext, conversationId: string): Promise<string> {
  const recent = await messageModel.listRecentForAgent(ctx.db, conversationId, FALLBACK_SUMMARY_MESSAGES)
  return recent
    .map((m) => `${m.direction === 'inbound' ? 'Contato' : 'Empresa'}: ${m.type === 'text' ? (m.body ?? '') : (TYPE_LABELS[m.type] ?? '')}`)
    .join('\n')
}

/** Automation stops and the team sees "aguardando humano" with the reason (FR-022, FR-023). */
export async function handOff(ctx: AppContext, conversationId: string, input: { reason: string; summary?: string | null }) {
  await cancelActiveRun(ctx, conversationId, 'handoff')
  const summary = input.summary?.trim() || (await recentTranscript(ctx, conversationId)) || null
  await conversationModel.handOff(ctx.db, conversationId, { reason: input.reason, summary })
  return publishConversation(ctx, conversationId)
}

export async function assume(ctx: AppContext, user: Pick<User, 'id'>, conversationId: string) {
  await cancelActiveRun(ctx, conversationId, 'stopped_by_user')
  await conversationModel.assume(ctx.db, conversationId, user.id)
  return publishConversation(ctx, conversationId)
}

export async function release(ctx: AppContext, conversationId: string) {
  await conversationModel.release(ctx.db, conversationId)
  return publishConversation(ctx, conversationId)
}

async function conversationOfContact(ctx: AppContext, contactId: string) {
  const contact = await contactModel.findById(ctx.db, contactId)
  if (!contact) throw notFound('Contato não encontrado.')
  return conversationModel.getOrCreateForContact(ctx.db, contactId)
}

/** "Não automatizar" (FR-028). `byUser` null = the contact asked for it by message. */
export async function setOptOut(ctx: AppContext, byUser: Pick<User, 'id'> | null, contactId: string) {
  const conversation = await conversationOfContact(ctx, contactId)
  await contactModel.setOptOut(ctx.db, contactId, byUser?.id ?? null)
  await cancelActiveRun(ctx, conversation.id, 'opt_out')
  return publishConversation(ctx, conversation.id)
}

export async function clearOptOut(ctx: AppContext, contactId: string) {
  const conversation = await conversationOfContact(ctx, contactId)
  await contactModel.clearOptOut(ctx.db, contactId)
  return publishConversation(ctx, conversation.id)
}
