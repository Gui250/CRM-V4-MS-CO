import type { StageRow } from '../db/schema.js'
import type { LeadWithRelations } from '../models/lead.js'
import type { PipelineWithStages } from '../models/pipeline.js'

const at = new Date('2026-09-22T12:00:00.000Z')

export function stageFixture(overrides: Partial<StageRow> = {}): StageRow {
  return { id: 's1', pipelineId: 'p1', name: 'Novo', color: 'gray', kind: 'open', position: 0, createdAt: at, updatedAt: at, ...overrides }
}

export function pipelineFixture(overrides: Partial<PipelineWithStages> = {}): PipelineWithStages {
  return {
    id: 'p1',
    name: 'Vendas',
    isEntry: true,
    archivedAt: null,
    createdAt: at,
    updatedAt: at,
    stages: [
      stageFixture(),
      stageFixture({ id: 's2', name: 'Em contato', position: 1 }),
      stageFixture({ id: 's3', name: 'Perdido', kind: 'lost', color: 'red', position: 2 }),
    ],
    ...overrides,
  }
}

export function leadFixture(overrides: Partial<LeadWithRelations> = {}): LeadWithRelations {
  return {
    id: 'l1',
    pipelineId: 'p1',
    stageId: 's1',
    contactId: 'c1',
    title: null,
    valueCents: null,
    assigneeId: null,
    notes: null,
    lostReason: null,
    position: 0,
    stageEnteredAt: at,
    createdById: null,
    createdAt: at,
    updatedAt: at,
    contact: { id: 'c1', waJid: '5511@s.whatsapp.net', phone: '5511', name: 'Carla', avatarUrl: null, automationOptOutAt: null, automationOptOutByUserId: null, createdAt: at, updatedAt: at },
    conversationId: 'cv1',
    unreadCount: 0,
    assignee: null,
    ...overrides,
  }
}
