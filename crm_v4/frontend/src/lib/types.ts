// Mirrors specs/001-whatsapp-chat-panel/contracts/openapi.yaml.

import type { Handling, MessageAutomation } from './automation-types'

export type UserRole = 'admin' | 'attendant'
export type UserStatus = 'pending' | 'active' | 'disabled'

export interface User {
  id: string
  name: string
  email: string
  role: UserRole
  status: UserStatus
  createdAt: string
}

export interface Connection {
  status: 'disconnected' | 'awaiting_qr' | 'connected'
  phoneNumber: string | null
  qrCode: string | null
  lastConnectedAt: string | null
}

export interface Contact {
  id: string
  phone: string
  name: string | null
  avatarUrl: string | null
}

export interface Conversation {
  id: string
  contact: Contact
  lastMessageAt: string | null
  lastMessagePreview: string | null
  unreadCount: number
  /** Feature 003: who answers the conversation. */
  handling: Handling
  automationOptOut: boolean
}

export type MessageStatus = 'pending' | 'sent' | 'delivered' | 'read' | 'failed'

export interface Message {
  id: string
  conversationId: string
  direction: 'inbound' | 'outbound'
  type: 'text' | 'image' | 'audio' | 'video' | 'document' | 'unsupported'
  body: string | null
  media: { url: string; mime: string; filename: string | null; size: number | null } | null
  status: MessageStatus | null
  sentBy: { id: string; name: string } | null
  /** Feature 003: sent by a flow or an AI agent. */
  automation: MessageAutomation
  sentAt: string
  error: string | null
}

export interface Page<T> {
  items: T[]
  nextCursor: string | null
}

// Feature 002, mirrors specs/002-sales-pipelines/contracts/openapi.yaml.

export type StageKind = 'open' | 'won' | 'lost'
export type StageColor = 'gray' | 'red' | 'orange' | 'amber' | 'green' | 'teal' | 'blue' | 'violet'

export interface UserRef {
  id: string
  name: string
}

export interface Stage {
  id: string
  pipelineId: string
  name: string
  color: StageColor
  kind: StageKind
  position: number
}

export interface Pipeline {
  id: string
  name: string
  isEntry: boolean
  archivedAt: string | null
  stages: Stage[]
}

export interface Lead {
  id: string
  pipelineId: string
  stageId: string
  position: number
  title: string | null
  valueCents: number | null
  assignee: UserRef | null
  lostReason: string | null
  stageEnteredAt: string
  createdAt: string
  contact: Contact
  conversationId: string | null
  unreadCount: number
}

export interface LeadDetail extends Lead {
  notes: string | null
  history: {
    id: string
    fromStageName: string | null
    toStageName: string | null
    changedBy: UserRef | null
    changedAt: string
  }[]
}

export interface BoardStage extends Stage {
  leadCount: number
  valueTotalCents: number
  leads: Lead[]
  nextCursor: string | null
}

export interface Board {
  pipeline: Pipeline
  stages: BoardStage[]
}
