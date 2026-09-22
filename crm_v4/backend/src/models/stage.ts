import { and, asc, count, desc, eq, ne } from 'drizzle-orm'
import { inTransaction, type Db } from '../db/client.js'
import { leads, leadStageChanges, pipelineStages, type StageRow } from '../db/schema.js'
import type { LeadSnapshot } from '../realtime/bus.js'
import { isUniqueViolation } from '../lib/db-errors.js'
import { conflict, DomainError, notFound } from '../lib/errors.js'
import { POSITION_GAP } from './lead.js'

export const STAGE_LIMIT = 20

type StageInput = Partial<Pick<StageRow, 'name' | 'color' | 'kind'>>

const nameTaken = () => conflict('STAGE_NAME_TAKEN', 'Já existe uma etapa com esse nome neste funil.')

async function withNameCheck<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work()
  } catch (error) {
    if (isUniqueViolation(error)) throw nameTaken()
    throw error
  }
}

const trimName = (input: StageInput) => (input.name === undefined ? input : { ...input, name: input.name.trim() })

async function stagesOf(db: Db, pipelineId: string): Promise<StageRow[]> {
  return db.select().from(pipelineStages).where(eq(pipelineStages.pipelineId, pipelineId)).orderBy(asc(pipelineStages.position))
}

async function findStage(db: Db, id: string): Promise<StageRow | null> {
  const [stage] = await db.select().from(pipelineStages).where(eq(pipelineStages.id, id))
  return stage ?? null
}

export async function create(db: Db, pipelineId: string, input: StageInput & { name: string }): Promise<StageRow> {
  return withNameCheck(() =>
    inTransaction(db, async (tx) => {
      const [row] = await tx.select({ value: count() }).from(pipelineStages).where(eq(pipelineStages.pipelineId, pipelineId))
      const total = row?.value ?? 0
      if (total >= STAGE_LIMIT) throw conflict('STAGE_LIMIT', `Um funil pode ter no máximo ${STAGE_LIMIT} etapas.`)
      const [stage] = await tx
        .insert(pipelineStages)
        .values({ ...trimName(input), name: input.name.trim(), pipelineId, position: total })
        .returning()
      return stage!
    }),
  )
}

export async function update(db: Db, id: string, input: StageInput): Promise<StageRow | null> {
  return withNameCheck(async () => {
    const [stage] = await db.update(pipelineStages).set(trimName(input)).where(eq(pipelineStages.id, id)).returning()
    return stage ?? null
  })
}

async function writePositions(db: Db, stageIds: string[]) {
  for (const [position, id] of stageIds.entries()) {
    await db.update(pipelineStages).set({ position }).where(eq(pipelineStages.id, id))
  }
}

/** `stageIds` must be exactly the pipeline's stages, in the new order. */
export async function reorder(db: Db, pipelineId: string, stageIds: string[]): Promise<StageRow[]> {
  return inTransaction(db, async (tx) => {
    const current = await stagesOf(tx, pipelineId)
    const sameSet = stageIds.length === current.length && new Set(stageIds).size === stageIds.length && current.every((s) => stageIds.includes(s.id))
    if (!sameSet) throw new DomainError('STAGE_ORDER_MISMATCH', 'A nova ordem precisa conter todas as etapas do funil.', 422)
    await writePositions(tx, stageIds)
    return stagesOf(tx, pipelineId)
  })
}

async function relocateLeads(db: Db, from: StageRow, to: StageRow, userId: string | null) {
  const moving = await db.select().from(leads).where(eq(leads.stageId, from.id)).orderBy(asc(leads.position), asc(leads.id))
  const [last] = await db.select({ position: leads.position }).from(leads).where(eq(leads.stageId, to.id)).orderBy(desc(leads.position)).limit(1)
  const start = last ? last.position + POSITION_GAP : 0
  const now = new Date()
  const relocated: { leadId: string; previous: LeadSnapshot }[] = []
  for (const [index, lead] of moving.entries()) {
    await db
      .update(leads)
      .set({
        stageId: to.id,
        position: start + index * POSITION_GAP,
        stageEnteredAt: now,
        lostReason: to.kind === 'lost' ? lead.lostReason : null,
      })
      .where(eq(leads.id, lead.id))
    await db.insert(leadStageChanges).values({
      leadId: lead.id,
      fromStageId: from.id,
      toStageId: to.id,
      fromStageName: from.name,
      toStageName: to.name,
      changedById: userId,
    })
    relocated.push({ leadId: lead.id, previous: { stageId: from.id, valueCents: lead.valueCents } })
  }
  return relocated
}

/** Deletes a stage; its leads (if any) go to the end of `moveToStageId`, with a history entry each. */
export async function remove(
  db: Db,
  input: { stageId: string; moveToStageId?: string; userId: string | null },
): Promise<{ pipelineId: string; relocated: { leadId: string; previous: LeadSnapshot }[] }> {
  return inTransaction(db, async (tx) => {
    const stage = await findStage(tx, input.stageId)
    if (!stage) throw notFound('Etapa não encontrada.')
    const siblings = await stagesOf(tx, stage.pipelineId)
    if (siblings.length <= 1) throw conflict('LAST_STAGE', 'Um funil precisa ter pelo menos uma etapa.')

    const [leadCount] = await tx.select({ value: count() }).from(leads).where(eq(leads.stageId, stage.id))
    let relocated: { leadId: string; previous: LeadSnapshot }[] = []
    if ((leadCount?.value ?? 0) > 0) {
      if (!input.moveToStageId) throw conflict('STAGE_NOT_EMPTY', 'Escolha para qual etapa os leads desta etapa vão antes de excluí-la.')
      const target = siblings.find((s) => s.id === input.moveToStageId && s.id !== stage.id)
      if (!target) throw new DomainError('INVALID_MOVE_TARGET', 'Escolha outra etapa deste mesmo funil.', 422)
      relocated = await relocateLeads(tx, stage, target, input.userId)
    }

    await tx.delete(pipelineStages).where(eq(pipelineStages.id, stage.id))
    const remaining = await tx
      .select({ id: pipelineStages.id })
      .from(pipelineStages)
      .where(and(eq(pipelineStages.pipelineId, stage.pipelineId), ne(pipelineStages.id, stage.id)))
      .orderBy(asc(pipelineStages.position))
    await writePositions(tx, remaining.map((s) => s.id))
    return { pipelineId: stage.pipelineId, relocated }
  })
}
