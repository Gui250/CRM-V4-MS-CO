import type { ConnectionRow, ContactRow, ConversationRow, MessageRow, StageRow, UserRow } from '../db/schema.js'
import type { LeadHistoryEntry, LeadWithRelations } from '../models/lead.js'
import type { PipelineWithStages } from '../models/pipeline.js'

export type UserDto = Pick<UserRow, 'id' | 'name' | 'email' | 'role' | 'status'> & { createdAt: string }

export interface ConnectionDto {
  status: ConnectionRow['status']
  phoneNumber: string | null
  qrCode: string | null
  lastConnectedAt: string | null
}

export interface ContactDto {
  id: string
  phone: string
  name: string | null
  avatarUrl: string | null
}

export interface ConversationDto {
  id: string
  contact: ContactDto
  lastMessageAt: string | null
  lastMessagePreview: string | null
  unreadCount: number
  handling: HandlingDto
  automationOptOut: boolean
}

export interface HandlingDto {
  mode: ConversationRow['handlingMode']
  reason: string | null
  summary: string | null
  handoffAt: string | null
  assumedBy: { id: string; name: string } | null
}

export interface MessageDto {
  id: string
  conversationId: string
  direction: MessageRow['direction']
  type: MessageRow['type']
  body: string | null
  media: { url: string; mime: string; filename: string | null; size: number | null } | null
  status: MessageRow['status']
  sentBy: { id: string; name: string } | null
  automation: { kind: 'flow' | 'agent'; name: string } | null
  sentAt: string
  error: string | null
}

export type StageDto = Pick<StageRow, 'id' | 'pipelineId' | 'name' | 'color' | 'kind' | 'position'>

export interface PipelineDto {
  id: string
  name: string
  isEntry: boolean
  archivedAt: string | null
  stages: StageDto[]
}

export interface LeadDto {
  id: string
  pipelineId: string
  stageId: string
  position: number
  title: string | null
  valueCents: number | null
  assignee: { id: string; name: string } | null
  lostReason: string | null
  stageEnteredAt: string
  createdAt: string
  contact: ContactDto
  conversationId: string | null
  unreadCount: number
}

export interface LeadDetailDto extends LeadDto {
  notes: string | null
  history: {
    id: string
    fromStageName: string | null
    toStageName: string | null
    changedBy: { id: string; name: string } | null
    changedAt: string
  }[]
}

const iso = (date: Date | null) => (date ? date.toISOString() : null)

export function toUserDto(user: Omit<UserRow, 'passwordHash'>): UserDto {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.status,
    createdAt: user.createdAt.toISOString(),
  }
}

export function toConnectionDto(connection: ConnectionRow): ConnectionDto {
  return {
    status: connection.status,
    phoneNumber: connection.phoneNumber,
    qrCode: connection.status === 'awaiting_qr' ? connection.lastQr : null,
    lastConnectedAt: iso(connection.lastConnectedAt),
  }
}

export function toConversationDto(
  conversation: ConversationRow & { contact: ContactRow; assumedBy?: { id: string; name: string } | null },
): ConversationDto {
  const { contact } = conversation
  return {
    id: conversation.id,
    contact: toContactDto(contact),
    lastMessageAt: iso(conversation.lastMessageAt),
    lastMessagePreview: conversation.lastMessagePreview,
    unreadCount: conversation.unreadCount,
    handling: {
      mode: conversation.handlingMode,
      reason: conversation.handoffReason,
      summary: conversation.handoffSummary,
      handoffAt: iso(conversation.handoffAt),
      assumedBy: conversation.assumedBy ?? null,
    },
    automationOptOut: contact.automationOptOutAt !== null,
  }
}

export function toMessageDto(
  message: MessageRow & { sentBy: { id: string; name: string } | null; automation?: MessageDto['automation'] },
): MessageDto {
  const hasMedia = message.type !== 'text' && message.type !== 'unsupported' && message.mediaPath !== null
  return {
    id: message.id,
    conversationId: message.conversationId,
    direction: message.direction,
    type: message.type,
    body: message.body,
    media: hasMedia
      ? {
          url: `/api/messages/${message.id}/media`,
          mime: message.mediaMime ?? 'application/octet-stream',
          filename: message.mediaFilename,
          size: message.mediaSize,
        }
      : null,
    status: message.status,
    sentBy: message.sentBy,
    automation: message.automation ?? null,
    sentAt: message.sentAt.toISOString(),
    error: message.error,
  }
}

function toContactDto(contact: ContactRow): ContactDto {
  return { id: contact.id, phone: contact.phone, name: contact.name, avatarUrl: contact.avatarUrl }
}

export function toStageDto(stage: StageRow): StageDto {
  return {
    id: stage.id,
    pipelineId: stage.pipelineId,
    name: stage.name,
    color: stage.color,
    kind: stage.kind,
    position: stage.position,
  }
}

export function toPipelineDto(pipeline: PipelineWithStages): PipelineDto {
  return {
    id: pipeline.id,
    name: pipeline.name,
    isEntry: pipeline.isEntry,
    archivedAt: iso(pipeline.archivedAt),
    stages: [...pipeline.stages].sort((a, b) => a.position - b.position).map(toStageDto),
  }
}

export function toLeadDto(lead: LeadWithRelations): LeadDto {
  return {
    id: lead.id,
    pipelineId: lead.pipelineId,
    stageId: lead.stageId,
    position: lead.position,
    title: lead.title,
    valueCents: lead.valueCents,
    assignee: lead.assignee,
    lostReason: lead.lostReason,
    stageEnteredAt: lead.stageEnteredAt.toISOString(),
    createdAt: lead.createdAt.toISOString(),
    contact: toContactDto(lead.contact),
    conversationId: lead.conversationId,
    unreadCount: lead.unreadCount,
  }
}

export function toLeadDetailDto(lead: LeadWithRelations, history: LeadHistoryEntry[]): LeadDetailDto {
  return {
    ...toLeadDto(lead),
    notes: lead.notes,
    history: history.map((entry) => ({
      id: entry.id,
      fromStageName: entry.fromStageName,
      toStageName: entry.toStageName,
      changedBy: entry.changedBy,
      changedAt: entry.changedAt.toISOString(),
    })),
  }
}
