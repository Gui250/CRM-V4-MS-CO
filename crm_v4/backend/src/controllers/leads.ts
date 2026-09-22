import type { AppContext } from '../context.js'
import { conflict, DomainError, notFound } from '../lib/errors.js'
import * as contactModel from '../models/contact.js'
import * as leadModel from '../models/lead.js'
import * as pipelineModel from '../models/pipeline.js'
import * as userModel from '../models/user.js'
import type { User } from '../models/user.js'
import type { LeadSnapshot } from '../realtime/bus.js'
import { toLeadDetailDto, toLeadDto, toPipelineDto, toStageDto } from './dto.js'

export const BOARD_PAGE_SIZE = 50
export const LOST_REASON_MAX = 200

/** `assignee` as sent by the client: `me`, `none` or a user id. */
export type BoardQuery = { assignee?: string; search?: string }

const ME = 'me'

function toFilter(user: User, query: BoardQuery): leadModel.LeadFilter {
  const filter: leadModel.LeadFilter = {}
  if (query.assignee) filter.assigneeId = query.assignee === ME ? user.id : query.assignee
  if (query.search) filter.search = query.search
  return filter
}

async function loadActivePipeline(ctx: AppContext, pipelineId: string) {
  const pipeline = await pipelineModel.findById(ctx.db, pipelineId)
  if (!pipeline || pipeline.archivedAt) throw notFound('Funil não encontrado.')
  return pipeline
}

async function loadLead(ctx: AppContext, leadId: string) {
  const lead = await leadModel.findById(ctx.db, leadId)
  if (!lead) throw notFound('Lead não encontrado.')
  return lead
}

const snapshot = (lead: leadModel.LeadWithRelations): LeadSnapshot => ({ stageId: lead.stageId, valueCents: lead.valueCents })

function publishUpserted(ctx: AppContext, lead: leadModel.LeadWithRelations, previous: LeadSnapshot | null) {
  const dto = toLeadDto(lead)
  ctx.bus.publish({ type: 'lead.upserted', data: { lead: dto, previous } })
  return dto
}

export async function getBoard(ctx: AppContext, user: User, pipelineId: string, query: BoardQuery) {
  const pipeline = await loadActivePipeline(ctx, pipelineId)
  const filter = toFilter(user, query)
  const summaries = await leadModel.stageSummaries(ctx.db, pipelineId, filter)
  const pages = await Promise.all(
    pipeline.stages.map((stage) => leadModel.listByStage(ctx.db, stage.id, { limit: BOARD_PAGE_SIZE, filter })),
  )
  return {
    pipeline: toPipelineDto(pipeline),
    stages: pipeline.stages.map((stage, index) => ({
      ...toStageDto(stage),
      ...(summaries.get(stage.id) ?? { leadCount: 0, valueTotalCents: 0 }),
      leads: pages[index]!.items.map(toLeadDto),
      nextCursor: pages[index]!.nextCursor,
    })),
  }
}

export async function listStageLeads(
  ctx: AppContext,
  user: User,
  pipelineId: string,
  stageId: string,
  query: BoardQuery & { cursor?: string; limit: number },
) {
  const pipeline = await loadActivePipeline(ctx, pipelineId)
  if (!pipeline.stages.some((stage) => stage.id === stageId)) throw notFound('Etapa não encontrada.')
  const page = await leadModel.listByStage(ctx.db, stageId, {
    ...(query.cursor ? { cursor: query.cursor } : {}),
    limit: query.limit,
    filter: toFilter(user, query),
  })
  return { items: page.items.map(toLeadDto), nextCursor: page.nextCursor }
}

function normalizeLostReason(reason: string | undefined): string {
  const trimmed = reason?.trim() ?? ''
  if (trimmed.length === 0 || trimmed.length > LOST_REASON_MAX) {
    throw new DomainError('LOST_REASON_REQUIRED', `Informe o motivo da perda (até ${LOST_REASON_MAX} caracteres).`, 422)
  }
  return trimmed
}

export async function moveLead(
  ctx: AppContext,
  user: User,
  leadId: string,
  input: { stageId: string; beforeLeadId?: string | null; lostReason?: string },
) {
  const lead = await loadLead(ctx, leadId)
  const pipeline = await pipelineModel.findById(ctx.db, lead.pipelineId)
  const target = pipeline?.stages.find((stage) => stage.id === input.stageId)
  const lostReason = target?.kind === 'lost' ? normalizeLostReason(input.lostReason) : undefined
  const moved = await leadModel.move(ctx.db, {
    leadId,
    stageId: input.stageId,
    beforeLeadId: input.beforeLeadId ?? null,
    lostReason,
    userId: user.id,
  })
  return publishUpserted(ctx, moved, snapshot(lead))
}

export async function createLead(
  ctx: AppContext,
  user: User,
  input: { pipelineId: string; contactId: string; stageId?: string },
) {
  const pipeline = await pipelineModel.findById(ctx.db, input.pipelineId)
  if (!pipeline) throw notFound('Funil não encontrado.')
  if (pipeline.archivedAt) throw conflict('PIPELINE_ARCHIVED', 'Este funil está arquivado.')
  if (!(await contactModel.findById(ctx.db, input.contactId))) throw notFound('Contato não encontrado.')
  const lead = await leadModel.create(ctx.db, { ...input, createdById: user.id })
  return publishUpserted(ctx, lead, null)
}

export async function listContactLeads(ctx: AppContext, contactId: string) {
  return (await leadModel.listByContact(ctx.db, contactId)).map(toLeadDto)
}

/**
 * Entry pipeline rule (FR-011). Never throws: a failure here must not lose the incoming
 * WhatsApp message, so it is logged and the attendant can still create the lead by hand.
 */
export async function enterFromWhatsApp(ctx: AppContext, contactId: string): Promise<void> {
  try {
    const entry = await pipelineModel.findEntry(ctx.db)
    if (!entry) return
    const lead = await leadModel.createIfAbsent(ctx.db, { pipelineId: entry.id, contactId, createdById: null })
    if (lead) publishUpserted(ctx, lead, null)
  } catch (error) {
    ctx.log.error({ err: error, contactId }, 'lead entry failed')
  }
}

export async function getLead(ctx: AppContext, leadId: string) {
  const lead = await loadLead(ctx, leadId)
  return toLeadDetailDto(lead, await leadModel.history(ctx.db, leadId))
}

export async function updateLead(ctx: AppContext, leadId: string, changes: leadModel.LeadChanges) {
  const before = await loadLead(ctx, leadId)
  if (changes.assigneeId) {
    const assignee = await userModel.findById(ctx.db, changes.assigneeId)
    if (assignee?.status !== 'active') {
      throw new DomainError('ASSIGNEE_INVALID', 'Escolha um usuário ativo como responsável.', 422)
    }
  }
  const updated = await leadModel.update(ctx.db, leadId, changes)
  if (!updated) throw notFound('Lead não encontrado.')
  return publishUpserted(ctx, updated, snapshot(before))
}

export async function deleteLead(ctx: AppContext, leadId: string): Promise<void> {
  const removed = await leadModel.remove(ctx.db, leadId)
  if (!removed) throw notFound('Lead não encontrado.')
  ctx.bus.publish({
    type: 'lead.deleted',
    data: {
      leadId,
      pipelineId: removed.pipelineId,
      stageId: removed.stageId,
      contactId: removed.contactId,
      valueCents: removed.valueCents,
    },
  })
}
