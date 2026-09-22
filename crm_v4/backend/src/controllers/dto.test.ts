import { describe, expect, it } from 'vitest'
import type { StageRow } from '../db/schema.js'
import type { LeadWithRelations } from '../models/lead.js'
import { toLeadDetailDto, toLeadDto, toPipelineDto } from './dto.js'

const at = new Date('2026-09-22T12:00:00.000Z')

const stage = (id: string, position: number): StageRow => ({
  id,
  pipelineId: 'p1',
  name: `Etapa ${position}`,
  color: 'gray',
  kind: 'open',
  position,
  createdAt: at,
  updatedAt: at,
})

const lead: LeadWithRelations = {
  id: 'l1',
  pipelineId: 'p1',
  stageId: 's1',
  contactId: 'c1',
  title: null,
  valueCents: 500000,
  assigneeId: 'u1',
  notes: 'ligar amanhã',
  lostReason: null,
  position: 0,
  stageEnteredAt: at,
  createdById: null,
  createdAt: at,
  updatedAt: at,
  contact: { id: 'c1', waJid: '55@s.whatsapp.net', phone: '55', name: 'Carla', avatarUrl: null, automationOptOutAt: null, automationOptOutByUserId: null, createdAt: at, updatedAt: at },
  conversationId: 'cv1',
  unreadCount: 2,
  assignee: { id: 'u1', name: 'Bia' },
}

describe('pipeline and lead DTOs', () => {
  it('orders stages by position', () => {
    const dto = toPipelineDto({
      id: 'p1',
      name: 'Vendas',
      isEntry: true,
      archivedAt: null,
      createdAt: at,
      updatedAt: at,
      stages: [stage('s2', 1), stage('s1', 0)],
    })
    expect(dto).toEqual({
      id: 'p1',
      name: 'Vendas',
      isEntry: true,
      archivedAt: null,
      stages: [
        { id: 's1', pipelineId: 'p1', name: 'Etapa 0', color: 'gray', kind: 'open', position: 0 },
        { id: 's2', pipelineId: 'p1', name: 'Etapa 1', color: 'gray', kind: 'open', position: 1 },
      ],
    })
  })

  it('shapes a lead card without internal columns', () => {
    const dto = toLeadDto(lead)
    expect(dto).toEqual({
      id: 'l1',
      pipelineId: 'p1',
      stageId: 's1',
      position: 0,
      title: null,
      valueCents: 500000,
      assignee: { id: 'u1', name: 'Bia' },
      lostReason: null,
      stageEnteredAt: '2026-09-22T12:00:00.000Z',
      createdAt: '2026-09-22T12:00:00.000Z',
      contact: { id: 'c1', phone: '55', name: 'Carla', avatarUrl: null },
      conversationId: 'cv1',
      unreadCount: 2,
    })
    expect(dto).not.toHaveProperty('notes')
  })

  it('adds notes and history to the detail', () => {
    const dto = toLeadDetailDto(lead, [
      {
        id: 'h1',
        leadId: 'l1',
        fromStageId: null,
        toStageId: 's1',
        fromStageName: null,
        toStageName: 'Novo',
        changedById: null,
        changedAt: at,
        changedBy: null,
      },
    ])
    expect(dto.notes).toBe('ligar amanhã')
    expect(dto.history).toEqual([
      { id: 'h1', fromStageName: null, toStageName: 'Novo', changedBy: null, changedAt: '2026-09-22T12:00:00.000Z' },
    ])
  })
})
