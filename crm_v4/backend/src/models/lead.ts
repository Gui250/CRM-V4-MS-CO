import { and, asc, count, desc, eq, ilike, isNull, lt, ne, or, sql, type SQL } from 'drizzle-orm'
import { inTransaction, type Db } from '../db/client.js'
import {
  contacts,
  conversations,
  leads,
  leadStageChanges,
  pipelines,
  pipelineStages,
  users,
  type ContactRow,
  type LeadRow,
  type LeadStageChangeRow,
  type StageRow,
} from '../db/schema.js'
import { conflict, DomainError, notFound } from '../lib/errors.js'

type UserRef = { id: string; name: string }

export type LeadWithRelations = LeadRow & {
  contact: ContactRow
  conversationId: string | null
  unreadCount: number
  assignee: UserRef | null
}

export type LeadHistoryEntry = LeadStageChangeRow & { changedBy: UserRef | null }

/** `assigneeId: 'none'` means unassigned leads. */
export type LeadFilter = { assigneeId?: string; search?: string }

export type StageSummary = { leadCount: number; valueTotalCents: number }

/** Spacing between cards; a move takes the midpoint of its neighbors (research §2). */
export const POSITION_GAP = 1024
/** Below this gap the stage is renumbered so midpoints stay representable. */
export const MIN_POSITION_GAP = 1e-6

const NONE = 'none'

const escapeLike = (term: string) => term.replace(/[\\%_]/g, (char) => `\\${char}`)

function filterConditions(filter: LeadFilter): (SQL | undefined)[] {
  const conditions: (SQL | undefined)[] = []
  if (filter.assigneeId === NONE) conditions.push(isNull(leads.assigneeId))
  else if (filter.assigneeId) conditions.push(eq(leads.assigneeId, filter.assigneeId))
  const term = filter.search?.trim()
  if (term) {
    const pattern = `%${escapeLike(term)}%`
    const digits = term.replace(/\D/g, '')
    conditions.push(
      or(ilike(contacts.name, pattern), ilike(leads.title, pattern), digits ? ilike(contacts.phone, `%${digits}%`) : undefined),
    )
  }
  return conditions
}

function selectLeads(db: Db) {
  return db
    .select({
      lead: leads,
      contact: contacts,
      conversationId: conversations.id,
      unreadCount: conversations.unreadCount,
      assigneeId: users.id,
      assigneeName: users.name,
    })
    .from(leads)
    .innerJoin(contacts, eq(contacts.id, leads.contactId))
    .leftJoin(conversations, eq(conversations.contactId, leads.contactId))
    .leftJoin(users, eq(users.id, leads.assigneeId))
}

type Joined = Awaited<ReturnType<ReturnType<typeof selectLeads>['execute']>>[number]

const toLead = (row: Joined): LeadWithRelations => ({
  ...row.lead,
  contact: row.contact,
  conversationId: row.conversationId,
  unreadCount: row.unreadCount ?? 0,
  assignee: row.assigneeId && row.assigneeName ? { id: row.assigneeId, name: row.assigneeName } : null,
})

const encodeCursor = (position: number, id: string) => Buffer.from(`${position}|${id}`).toString('base64url')

function decodeCursor(cursor: string): { position: number; id: string } | null {
  const [position, id] = Buffer.from(cursor, 'base64url').toString().split('|')
  const value = Number(position)
  return id && position && Number.isFinite(value) ? { position: value, id } : null
}

export async function findById(db: Db, id: string): Promise<LeadWithRelations | null> {
  const [row] = await selectLeads(db).where(eq(leads.id, id))
  return row ? toLead(row) : null
}

/** Count and value total per stage over every lead matching the filter; empty stages get zeros. */
export async function stageSummaries(db: Db, pipelineId: string, filter: LeadFilter): Promise<Map<string, StageSummary>> {
  const stages = await db.select({ id: pipelineStages.id }).from(pipelineStages).where(eq(pipelineStages.pipelineId, pipelineId))
  const rows = await db
    .select({
      stageId: leads.stageId,
      leadCount: count(),
      valueTotalCents: sql<string>`coalesce(sum(${leads.valueCents}), 0)`,
    })
    .from(leads)
    .innerJoin(contacts, eq(contacts.id, leads.contactId))
    .where(and(eq(leads.pipelineId, pipelineId), ...filterConditions(filter)))
    .groupBy(leads.stageId)
  const summaries = new Map<string, StageSummary>(stages.map((stage) => [stage.id, { leadCount: 0, valueTotalCents: 0 }]))
  for (const row of rows) {
    summaries.set(row.stageId, { leadCount: row.leadCount, valueTotalCents: Number(row.valueTotalCents) })
  }
  return summaries
}

export async function listByStage(
  db: Db,
  stageId: string,
  options: { cursor?: string; limit: number; filter: LeadFilter },
): Promise<{ items: LeadWithRelations[]; nextCursor: string | null }> {
  const cursor = options.cursor ? decodeCursor(options.cursor) : null
  const rows = await selectLeads(db)
    .where(
      and(
        eq(leads.stageId, stageId),
        cursor ? sql`(${leads.position}, ${leads.id}) > (${cursor.position}::double precision, ${cursor.id}::uuid)` : undefined,
        ...filterConditions(options.filter),
      ),
    )
    .orderBy(asc(leads.position), asc(leads.id))
    .limit(options.limit + 1)
  const page = rows.slice(0, options.limit).map(toLead)
  const last = page.at(-1)
  return {
    items: page,
    nextCursor: rows.length > options.limit && last ? encodeCursor(last.position, last.id) : null,
  }
}

async function findStage(db: Db, id: string): Promise<StageRow | null> {
  const [stage] = await db.select().from(pipelineStages).where(eq(pipelineStages.id, id))
  return stage ?? null
}

/** Rewrites positions as 0, GAP, 2·GAP… in the current order, leaving `excludeId` untouched. */
async function renumberStage(db: Db, stageId: string, excludeId: string) {
  const rows = await db
    .select({ id: leads.id })
    .from(leads)
    .where(and(eq(leads.stageId, stageId), ne(leads.id, excludeId)))
    .orderBy(asc(leads.position), asc(leads.id))
  for (const [index, row] of rows.entries()) {
    await db.update(leads).set({ position: index * POSITION_GAP }).where(eq(leads.id, row.id))
  }
}

async function neighborBefore(db: Db, stageId: string, anchor: { position: number; id: string }, excludeId: string) {
  const [row] = await db
    .select({ position: leads.position })
    .from(leads)
    .where(
      and(
        eq(leads.stageId, stageId),
        ne(leads.id, excludeId),
        or(lt(leads.position, anchor.position), and(eq(leads.position, anchor.position), lt(leads.id, anchor.id))),
      ),
    )
    .orderBy(desc(leads.position), desc(leads.id))
    .limit(1)
  return row ?? null
}

async function lastPosition(db: Db, stageId: string, excludeId: string): Promise<number | null> {
  const [row] = await db
    .select({ position: leads.position })
    .from(leads)
    .where(and(eq(leads.stageId, stageId), ne(leads.id, excludeId)))
    .orderBy(desc(leads.position))
    .limit(1)
  return row ? row.position : null
}

/** Position for `leadId` right above `beforeLeadId` (or at the end when null) in `stageId`. */
async function positionFor(db: Db, stageId: string, leadId: string, beforeLeadId: string | null): Promise<number> {
  if (!beforeLeadId) {
    const last = await lastPosition(db, stageId, leadId)
    return last === null ? 0 : last + POSITION_GAP
  }
  const [before] = await db
    .select({ id: leads.id, position: leads.position })
    .from(leads)
    .where(and(eq(leads.id, beforeLeadId), eq(leads.stageId, stageId), ne(leads.id, leadId)))
  if (!before) throw notFound('O lead de referência não está nesta etapa.')
  const previous = await neighborBefore(db, stageId, before, leadId)
  if (!previous) return before.position - POSITION_GAP
  if (before.position - previous.position >= MIN_POSITION_GAP * 2) return (previous.position + before.position) / 2
  await renumberStage(db, stageId, leadId)
  return positionFor(db, stageId, leadId, beforeLeadId)
}

export async function move(
  db: Db,
  input: { leadId: string; stageId: string; beforeLeadId: string | null; lostReason?: string; userId: string | null },
): Promise<LeadWithRelations> {
  return inTransaction(db, async (tx) => {
    const [lead] = await tx.select().from(leads).where(eq(leads.id, input.leadId))
    if (!lead) throw notFound('Lead não encontrado.')
    const target = await findStage(tx, input.stageId)
    if (!target) throw notFound('Etapa não encontrada.')
    if (target.pipelineId !== lead.pipelineId) {
      throw new DomainError('STAGE_OTHER_PIPELINE', 'A etapa escolhida é de outro funil.', 422)
    }

    const position = await positionFor(tx, target.id, lead.id, input.beforeLeadId)
    const changesStage = target.id !== lead.stageId
    const lostReason = target.kind === 'lost' ? (input.lostReason ?? lead.lostReason) : null
    await tx
      .update(leads)
      .set({ stageId: target.id, position, lostReason, ...(changesStage ? { stageEnteredAt: new Date() } : {}) })
      .where(eq(leads.id, lead.id))

    if (changesStage) {
      const from = await findStage(tx, lead.stageId)
      await tx.insert(leadStageChanges).values({
        leadId: lead.id,
        fromStageId: lead.stageId,
        toStageId: target.id,
        fromStageName: from?.name ?? null,
        toStageName: target.name,
        changedById: input.userId,
      })
    }
    return (await findById(tx, lead.id))!
  })
}


type NewLead = { pipelineId: string; contactId: string; stageId?: string; createdById: string | null }

/** Chosen stage (must be in the pipeline), else the first open stage, else the first stage. */
async function initialStage(db: Db, pipelineId: string, stageId?: string): Promise<StageRow> {
  if (stageId) {
    const stage = await findStage(db, stageId)
    if (!stage) throw notFound('Etapa não encontrada.')
    if (stage.pipelineId !== pipelineId) throw new DomainError('STAGE_OTHER_PIPELINE', 'A etapa escolhida é de outro funil.', 422)
    return stage
  }
  const stages = await db.select().from(pipelineStages).where(eq(pipelineStages.pipelineId, pipelineId)).orderBy(asc(pipelineStages.position))
  const stage = stages.find((s) => s.kind === 'open') ?? stages[0]
  if (!stage) throw notFound('O funil não tem etapas.')
  return stage
}

async function firstPosition(db: Db, stageId: string): Promise<number> {
  const [row] = await db
    .select({ position: leads.position })
    .from(leads)
    .where(eq(leads.stageId, stageId))
    .orderBy(asc(leads.position))
    .limit(1)
  return row ? row.position - POSITION_GAP : 0
}

/** New leads go to the top of their stage. Returns null when the contact already has a lead in the pipeline. */
export async function createIfAbsent(db: Db, input: NewLead): Promise<LeadWithRelations | null> {
  return inTransaction(db, async (tx) => {
    const stage = await initialStage(tx, input.pipelineId, input.stageId)
    const [created] = await tx
      .insert(leads)
      .values({
        pipelineId: input.pipelineId,
        stageId: stage.id,
        contactId: input.contactId,
        position: await firstPosition(tx, stage.id),
        createdById: input.createdById,
      })
      .onConflictDoNothing({ target: [leads.pipelineId, leads.contactId] })
      .returning({ id: leads.id })
    if (!created) return null
    await tx.insert(leadStageChanges).values({
      leadId: created.id,
      toStageId: stage.id,
      toStageName: stage.name,
      changedById: input.createdById,
    })
    return findById(tx, created.id)
  })
}

export async function create(db: Db, input: NewLead): Promise<LeadWithRelations> {
  const lead = await createIfAbsent(db, input)
  if (!lead) throw conflict('LEAD_EXISTS', 'Este contato já é um lead neste funil.')
  return lead
}

/** The contact's leads in active pipelines (chat header). */
export async function listByContact(db: Db, contactId: string): Promise<LeadWithRelations[]> {
  const rows = await selectLeads(db)
    .innerJoin(pipelines, eq(pipelines.id, leads.pipelineId))
    .where(and(eq(leads.contactId, contactId), isNull(pipelines.archivedAt)))
    .orderBy(asc(pipelines.name))
  return rows.map(toLead)
}

export type LeadChanges = Partial<Pick<LeadRow, 'title' | 'valueCents' | 'assigneeId' | 'notes'>>

export async function update(db: Db, id: string, changes: LeadChanges): Promise<LeadWithRelations | null> {
  const [row] = await db.update(leads).set(changes).where(eq(leads.id, id)).returning({ id: leads.id })
  return row ? findById(db, row.id) : null
}

/** Stage changes, newest first. */
export async function history(db: Db, leadId: string): Promise<LeadHistoryEntry[]> {
  const rows = await db
    .select({ change: leadStageChanges, authorId: users.id, authorName: users.name })
    .from(leadStageChanges)
    .leftJoin(users, eq(users.id, leadStageChanges.changedById))
    .where(eq(leadStageChanges.leadId, leadId))
    .orderBy(desc(leadStageChanges.changedAt), desc(leadStageChanges.id))
  return rows.map((row) => ({
    ...row.change,
    changedBy: row.authorId && row.authorName ? { id: row.authorId, name: row.authorName } : null,
  }))
}

/** Deletes the lead and its history; the contact and its conversation stay. */
export async function remove(db: Db, id: string): Promise<LeadRow | null> {
  const [row] = await db.delete(leads).where(eq(leads.id, id)).returning()
  return row ?? null
}
