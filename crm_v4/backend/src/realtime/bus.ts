import { EventEmitter } from 'node:events'
import type { RunSummaryDto } from '../controllers/automation-dto.js'
import type { ConnectionDto, ConversationDto, LeadDto, MessageDto } from '../controllers/dto.js'

export type RealtimeEvent =
  | { type: 'message.created'; data: { message: MessageDto; conversation: ConversationDto } }
  | { type: 'message.updated'; data: { message: MessageDto } }
  | { type: 'conversation.updated'; data: { conversation: ConversationDto } }
  | { type: 'connection.updated'; data: { connection: ConnectionDto } }
  | { type: 'lead.upserted'; data: { lead: LeadDto; previous: LeadSnapshot | null } }
  | {
      type: 'lead.deleted'
      data: { leadId: string; pipelineId: string; stageId: string; contactId: string; valueCents: number | null }
    }
  | { type: 'pipeline.changed'; data: { pipelineId: string } }
  | { type: 'run.updated'; data: { run: RunSummaryDto } }

/** A lead's column and value before a change, so clients can adjust column totals exactly. */
export type LeadSnapshot = { stageId: string; valueCents: number | null }

export type EventHandler = (event: RealtimeEvent) => void

export interface EventBus {
  publish(event: RealtimeEvent): void
  subscribe(handler: EventHandler): () => void
}

// In-memory: only works with a single backend instance. To scale horizontally, back this
// with Postgres LISTEN/NOTIFY so every instance receives every event.
export function createEventBus(): EventBus {
  const emitter = new EventEmitter()
  emitter.setMaxListeners(0)
  return {
    publish: (event) => emitter.emit('event', event),
    subscribe(handler) {
      emitter.on('event', handler)
      return () => emitter.off('event', handler)
    },
  }
}
