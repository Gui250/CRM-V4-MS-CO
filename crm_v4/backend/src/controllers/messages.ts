import type { Readable } from 'node:stream'
import type { AppContext } from '../context.js'
import type { MessageRow } from '../db/schema.js'
import type { MediaType } from '../integrations/evolution/client.js'
import type { UpsertMessage } from '../integrations/evolution/webhook-schemas.js'
import { conflict, DomainError, notFound } from '../lib/errors.js'
import * as contactModel from '../models/contact.js'
import * as conversationModel from '../models/conversation.js'
import * as messageModel from '../models/message.js'
import type { User } from '../models/user.js'
import { isConnected } from './connection.js'
import { toConversationDto, toMessageDto } from './dto.js'
import * as triggers from './automation/triggers.js'
import * as handling from './handling.js'
import { enterFromWhatsApp } from './leads.js'
import * as mapping from './webhook-mapping.js'

export const TEXT_MAX = 4096
export const CAPTION_MAX = 1024
export const IMAGE_MAX_BYTES = 16 * 1024 * 1024
export const DOCUMENT_MAX_BYTES = 100 * 1024 * 1024

const MEDIA_TYPES = new Set<MessageRow['type']>(['image', 'audio', 'video', 'document'])
const DOCUMENT_MIMES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'application/zip',
])

// Raster formats only: SVG can carry scripts.
const IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

const SEND_FAILED = 'Não foi possível enviar pelo WhatsApp. Tente reenviar.'

const mediaKey = (messageId: string, at = new Date()) =>
  `media/${at.getUTCFullYear()}/${String(at.getUTCMonth() + 1).padStart(2, '0')}/${messageId}`

function publishUpdated(ctx: AppContext, message: messageModel.MessageWithSender | null) {
  if (message) ctx.bus.publish({ type: 'message.updated', data: { message: toMessageDto(message) } })
}

async function publishCreated(ctx: AppContext, message: messageModel.MessageWithSender) {
  const conversation = await conversationModel.findById(ctx.db, message.conversationId)
  if (!conversation) return
  ctx.bus.publish({
    type: 'message.created',
    data: { message: toMessageDto(message), conversation: toConversationDto(conversation) },
  })
}

async function assertConnected(ctx: AppContext) {
  if (!(await isConnected(ctx))) {
    throw conflict('WHATSAPP_DISCONNECTED', 'O WhatsApp está desconectado. Conecte o número para enviar mensagens.')
  }
}

/** Downloads inbound media from WhatsApp into storage. Failures are logged; the message stays without media. */
async function persistMedia(ctx: AppContext, message: messageModel.MessageWithSender) {
  if (!message.waMessageId) return null
  try {
    const media = await ctx.evolution.getMediaBase64(message.waMessageId)
    const data = Buffer.from(media.base64, 'base64')
    const key = mediaKey(message.id, message.sentAt)
    await ctx.storage.put(key, data, media.mimetype)
    return await messageModel.setMedia(ctx.db, message.id, {
      mediaPath: key,
      mediaMime: media.mimetype,
      mediaFilename: message.mediaFilename ?? media.fileName,
      mediaSize: data.length,
    })
  } catch (error) {
    ctx.log.warn({ err: error, messageId: message.id }, 'media download failed')
    return null
  }
}

async function fetchAvatar(ctx: AppContext, contactId: string, phone: string) {
  try {
    const url = await ctx.evolution.fetchProfilePictureUrl(phone)
    if (url) await contactModel.setAvatar(ctx.db, contactId, url)
  } catch (error) {
    ctx.log.warn({ err: error, contactId }, 'profile picture fetch failed')
  }
}

export async function receive(ctx: AppContext, incoming: UpsertMessage): Promise<void> {
  const jid = mapping.resolveChatJid(incoming.key)
  if (mapping.isIgnoredJid(jid)) return
  const fromMe = incoming.key.fromMe

  const { contact, created: isNewContact } = await contactModel.upsertByJid(ctx.db, {
    waJid: jid,
    name: fromMe ? null : (incoming.pushName ?? null),
  })
  if (isNewContact) await fetchAvatar(ctx, contact.id, contact.phone)
  const conversation = await conversationModel.getOrCreateForContact(ctx.db, contact.id)

  const type = mapping.mapMessageType(incoming.messageType, incoming.message)
  const body = mapping.extractBody(incoming.message, type)
  const meta = mapping.extractMediaMeta(incoming.message, type)
  const sentAt = mapping.timestampToDate(incoming.messageTimestamp)

  const { message, created } = await messageModel.insertFromWhatsApp(ctx.db, {
    conversationId: conversation.id,
    waMessageId: incoming.key.id,
    direction: fromMe ? 'outbound' : 'inbound',
    type,
    body,
    mediaMime: meta.mime,
    mediaFilename: meta.fileName,
    mediaSize: meta.size,
    sentAt,
  })
  // Re-delivered webhook, or our own panel message echoed back: nothing new to show.
  if (!created) return

  await conversationModel.touch(ctx.db, conversation.id, {
    at: sentAt,
    preview: mapping.previewFor(type, body),
    incrementUnread: !fromMe,
  })
  await publishCreated(ctx, message)
  // First message a contact ever sends makes them a lead in the entry pipeline (feature 002).
  if (!fromMe && !(await messageModel.hasOtherInbound(ctx.db, conversation.id, message.id))) {
    await enterFromWhatsApp(ctx, contact.id)
  }
  if (!fromMe) startAutomation(ctx, { conversation, contact, message })
  if (MEDIA_TYPES.has(type)) publishUpdated(ctx, await persistMedia(ctx, message))
}

/** Fire and forget: the Evolution webhook must answer fast even when an AI agent takes seconds. */
function startAutomation(ctx: AppContext, event: triggers.InboundEvent) {
  Promise.resolve()
    .then(() => triggers.onInboundMessage(ctx, event))
    .catch((error: unknown) => {
      ctx.log.error({ err: error, conversationId: event.conversation.id }, 'automation trigger failed')
    })
}

/** An attendant writing in a conversation nobody has taken takes it over and stops automation (FR-022). */
async function takeOverIfUnassigned(ctx: AppContext, user: User, conversation: conversationModel.ConversationWithContact) {
  if (conversation.assumedByUserId === null) await handling.assume(ctx, user, conversation.id)
}

export async function updateStatus(ctx: AppContext, waMessageId: string, rawStatus: string): Promise<void> {
  const status = mapping.mapStatus(rawStatus)
  if (!status) return
  publishUpdated(ctx, await messageModel.advanceStatus(ctx.db, waMessageId, status))
}

async function readStored(ctx: AppContext, key: string): Promise<Buffer> {
  const stream = await ctx.storage.get(key)
  if (!stream) throw new Error(`stored media missing: ${key}`)
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(Buffer.from(chunk as Buffer))
  return Buffer.concat(chunks)
}

async function deliver(ctx: AppContext, message: messageModel.MessageWithSender, phone: string) {
  try {
    const { waMessageId } =
      message.type === 'text'
        ? await ctx.evolution.sendText(phone, message.body ?? '')
        : await ctx.evolution.sendMedia({
            number: phone,
            mediatype: message.type as MediaType,
            mimetype: message.mediaMime ?? 'application/octet-stream',
            caption: message.body ?? undefined,
            base64: (await readStored(ctx, message.mediaPath!)).toString('base64'),
            fileName: message.mediaFilename ?? 'arquivo',
          })
    const sent = await messageModel.markSent(ctx.db, message.id, waMessageId)
    publishUpdated(ctx, sent)
    return sent
  } catch (error) {
    ctx.log.warn({ err: error, messageId: message.id }, 'send failed')
    const failed = await messageModel.markFailed(ctx.db, message.id, SEND_FAILED)
    publishUpdated(ctx, failed)
    return failed ?? message
  }
}

async function loadConversation(ctx: AppContext, conversationId: string) {
  const conversation = await conversationModel.findById(ctx.db, conversationId)
  if (!conversation) throw notFound('Conversa não encontrada.')
  return conversation
}

async function startSending(
  ctx: AppContext,
  conversation: conversationModel.ConversationWithContact,
  pending: messageModel.MessageWithSender,
) {
  await conversationModel.touch(ctx.db, conversation.id, {
    at: pending.sentAt,
    preview: mapping.previewFor(pending.type, pending.body),
    incrementUnread: false,
  })
  await publishCreated(ctx, pending)
  return toMessageDto(await deliver(ctx, pending, conversation.contact.phone))
}

export async function sendText(ctx: AppContext, user: User, conversationId: string, text: string) {
  const conversation = await loadConversation(ctx, conversationId)
  const body = text.trim()
  if (body.length === 0 || body.length > TEXT_MAX) {
    throw new DomainError('VALIDATION_ERROR', `A mensagem precisa ter entre 1 e ${TEXT_MAX} caracteres.`, 422)
  }
  await assertConnected(ctx)
  await takeOverIfUnassigned(ctx, user, conversation)
  const pending = await messageModel.insertPending(ctx.db, { conversationId, type: 'text', body, sentByUserId: user.id })
  return startSending(ctx, conversation, pending)
}

export type AutomatedContent =
  | { text: string }
  | { media: { mediaPath: string; mime: string; filename: string; caption?: string } }

/**
 * Sends on behalf of a flow or agent (feature 003) through the same pending → deliver path as the
 * panel, so status, retry and SSE behave the same. Throws WHATSAPP_DISCONNECTED; a failed delivery
 * returns the message with status "failed".
 */
export async function sendAutomated(
  ctx: AppContext,
  conversationId: string,
  content: AutomatedContent,
  source: { flowRunId: string; aiAgentId?: string | null },
) {
  const conversation = await loadConversation(ctx, conversationId)
  await assertConnected(ctx)
  const origin = { conversationId, flowRunId: source.flowRunId, aiAgentId: source.aiAgentId ?? null }
  const pending =
    'text' in content
      ? await messageModel.insertPending(ctx.db, { ...origin, type: 'text', body: content.text.slice(0, TEXT_MAX) })
      : await messageModel.insertPending(ctx.db, {
          ...origin,
          type: IMAGE_MIMES.has(content.media.mime) ? 'image' : 'document',
          body: content.media.caption?.slice(0, CAPTION_MAX) || null,
          mediaMime: content.media.mime,
          mediaFilename: content.media.filename,
        })
  const withMedia =
    'media' in content
      ? ((await messageModel.setMedia(ctx.db, pending.id, {
          mediaPath: content.media.mediaPath,
          mediaMime: content.media.mime,
          mediaFilename: content.media.filename,
          mediaSize: 0,
        })) ?? pending)
      : pending
  return startSending(ctx, conversation, withMedia)
}

export function classifyUpload(mime: string, size: number): MediaType {
  const type: MediaType | null = IMAGE_MIMES.has(mime) ? 'image' : DOCUMENT_MIMES.has(mime) ? 'document' : null
  if (!type) throw new DomainError('UNSUPPORTED_MEDIA', 'Tipo de arquivo não suportado. Envie imagens (JPG, PNG, WEBP, GIF) ou documentos.', 415)
  const max = type === 'image' ? IMAGE_MAX_BYTES : DOCUMENT_MAX_BYTES
  if (size > max) {
    throw new DomainError('FILE_TOO_LARGE', `Arquivo acima do limite de ${max / (1024 * 1024)} MB.`, 413)
  }
  return type
}

export async function sendMedia(
  ctx: AppContext,
  user: User,
  conversationId: string,
  file: { data: Buffer; mime: string; filename: string; caption?: string },
) {
  const conversation = await loadConversation(ctx, conversationId)
  const type = classifyUpload(file.mime, file.data.length)
  const caption = file.caption?.trim().slice(0, CAPTION_MAX) || null
  await assertConnected(ctx)
  await takeOverIfUnassigned(ctx, user, conversation)

  const created = await messageModel.insertPending(ctx.db, {
    conversationId,
    type,
    body: caption,
    mediaMime: file.mime,
    mediaFilename: file.filename,
    mediaSize: file.data.length,
    sentByUserId: user.id,
  })
  const key = mediaKey(created.id)
  await ctx.storage.put(key, file.data, file.mime)
  const pending = (await messageModel.setMedia(ctx.db, created.id, {
    mediaPath: key,
    mediaMime: file.mime,
    mediaFilename: file.filename,
    mediaSize: file.data.length,
  }))!
  return startSending(ctx, conversation, pending)
}

export async function retry(ctx: AppContext, messageId: string) {
  const existing = await messageModel.findById(ctx.db, messageId)
  if (!existing) throw notFound('Mensagem não encontrada.')
  await assertConnected(ctx)
  const pending = await messageModel.resetForRetry(ctx.db, messageId)
  if (!pending) throw conflict('NOT_RETRYABLE', 'Só é possível reenviar mensagens que falharam.')
  publishUpdated(ctx, pending)
  const conversation = await loadConversation(ctx, pending.conversationId)
  return toMessageDto(await deliver(ctx, pending, conversation.contact.phone))
}

export async function getMedia(
  ctx: AppContext,
  messageId: string,
): Promise<{ stream: Readable; mime: string; filename: string | null; type: MessageRow['type'] }> {
  let message = await messageModel.findById(ctx.db, messageId)
  if (!message || !MEDIA_TYPES.has(message.type)) throw notFound('Mídia não encontrada.')
  if (!message.mediaPath && message.direction === 'inbound') message = (await persistMedia(ctx, message)) ?? message
  const stream = message.mediaPath ? await ctx.storage.get(message.mediaPath) : null
  if (!stream) throw notFound('Mídia não encontrada.')
  return { stream, mime: message.mediaMime ?? 'application/octet-stream', filename: message.mediaFilename, type: message.type }
}
