import type { MessageRow } from '../db/schema.js'
import type { UpsertMessage } from '../integrations/evolution/webhook-schemas.js'

type MessageType = MessageRow['type']
type Content = Record<string, unknown>

const IGNORED_SUFFIXES = ['@g.us', '@broadcast', '@newsletter']

/** Groups, status broadcasts and channels are out of scope (FR-014). */
export const isIgnoredJid = (jid: string) => IGNORED_SUFFIXES.some((suffix) => jid.endsWith(suffix))

/** Prefers the phone-number JID when WhatsApp addresses the chat by an opaque "@lid". */
export function resolveChatJid(key: UpsertMessage['key']): string {
  if (!key.remoteJid.endsWith('@lid')) return key.remoteJid
  const alt = [key.remoteJidAlt, key.senderPn].find((jid) => jid?.endsWith('@s.whatsapp.net'))
  return alt ?? key.remoteJid
}

const TYPE_BY_KEY: Record<string, MessageType> = {
  conversation: 'text',
  extendedTextMessage: 'text',
  imageMessage: 'image',
  audioMessage: 'audio',
  videoMessage: 'video',
  documentMessage: 'document',
  documentWithCaptionMessage: 'document',
}

export function mapMessageType(messageType: string | undefined, message: Content | null | undefined): MessageType {
  if (messageType && TYPE_BY_KEY[messageType]) return TYPE_BY_KEY[messageType]
  const key = Object.keys(message ?? {}).find((k) => TYPE_BY_KEY[k])
  return key ? TYPE_BY_KEY[key]! : 'unsupported'
}

const asRecord = (value: unknown): Content | undefined =>
  value && typeof value === 'object' ? (value as Content) : undefined
const asString = (value: unknown) => (typeof value === 'string' && value.length > 0 ? value : undefined)

/** documentWithCaptionMessage wraps a regular documentMessage one level deeper. */
function mediaContent(message: Content | null | undefined, type: MessageType): Content | undefined {
  if (!message) return undefined
  const wrapped = asRecord(asRecord(message.documentWithCaptionMessage)?.message)
  const key = `${type}Message`
  return asRecord(message[key]) ?? asRecord(wrapped?.[key])
}

export function extractBody(message: Content | null | undefined, type: MessageType): string | null {
  if (!message) return null
  if (type === 'text') return asString(message.conversation) ?? asString(asRecord(message.extendedTextMessage)?.text) ?? null
  return asString(mediaContent(message, type)?.caption) ?? null
}

export function extractMediaMeta(message: Content | null | undefined, type: MessageType) {
  const content = mediaContent(message, type)
  const length = content?.fileLength
  const size = typeof length === 'number' ? length : typeof length === 'string' ? Number(length) : NaN
  return {
    mime: asString(content?.mimetype) ?? null,
    fileName: asString(content?.fileName) ?? null,
    size: Number.isFinite(size) ? size : null,
  }
}

const STATUS_MAP: Record<string, NonNullable<MessageRow['status']>> = {
  SERVER_ACK: 'sent',
  DELIVERY_ACK: 'delivered',
  READ: 'read',
  PLAYED: 'read',
}
export const mapStatus = (status: string) => STATUS_MAP[status.toUpperCase()] ?? null

const PREVIEW_BY_TYPE: Record<Exclude<MessageType, 'text'>, string> = {
  image: '📷 Imagem',
  audio: '🎤 Áudio',
  video: '🎬 Vídeo',
  document: '📄 Documento',
  unsupported: 'Mensagem não suportada',
}

export function previewFor(type: MessageType, body: string | null): string {
  if (type === 'text') return body ?? ''
  return body ? `${PREVIEW_BY_TYPE[type]}: ${body}` : PREVIEW_BY_TYPE[type]
}

export function timestampToDate(value: number | string | undefined): Date {
  const seconds = typeof value === 'string' ? Number(value) : value
  return seconds && Number.isFinite(seconds) ? new Date(seconds * 1000) : new Date()
}
