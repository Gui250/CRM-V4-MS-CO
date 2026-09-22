import { and, asc, eq, inArray, isNull, type SQL } from 'drizzle-orm'
import { inTransaction, type Db } from '../db/client.js'
import { pipelines, pipelineStages, type PipelineRow, type StageRow } from '../db/schema.js'
import { isUniqueViolation } from '../lib/db-errors.js'
import { conflict } from '../lib/errors.js'

export type PipelineWithStages = PipelineRow & { stages: StageRow[] }

/** Suggested stages of a new pipeline (FR-002); admins edit them afterwards. */
export const DEFAULT_STAGES: Pick<StageRow, 'name' | 'kind' | 'color'>[] = [
  { name: 'Novo', kind: 'open', color: 'gray' },
  { name: 'Em contato', kind: 'open', color: 'blue' },
  { name: 'Proposta', kind: 'open', color: 'amber' },
  { name: 'Ganho', kind: 'won', color: 'green' },
  { name: 'Perdido', kind: 'lost', color: 'red' },
]

const nameTaken = () => conflict('PIPELINE_NAME_TAKEN', 'Já existe um funil com esse nome.')

async function withStages(db: Db, rows: PipelineRow[]): Promise<PipelineWithStages[]> {
  if (rows.length === 0) return []
  const stages = await db
    .select()
    .from(pipelineStages)
    .where(
      inArray(
        pipelineStages.pipelineId,
        rows.map((row) => row.id),
      ),
    )
    .orderBy(asc(pipelineStages.position))
  return rows.map((row) => ({ ...row, stages: stages.filter((stage) => stage.pipelineId === row.id) }))
}

export async function list(db: Db, options: { includeArchived: boolean }): Promise<PipelineWithStages[]> {
  const where: SQL | undefined = options.includeArchived ? undefined : isNull(pipelines.archivedAt)
  const rows = await db.select().from(pipelines).where(where).orderBy(asc(pipelines.name))
  return withStages(db, rows)
}

export async function findById(db: Db, id: string): Promise<PipelineWithStages | null> {
  const rows = await db.select().from(pipelines).where(eq(pipelines.id, id))
  const [pipeline] = await withStages(db, rows)
  return pipeline ?? null
}

export async function findEntry(db: Db): Promise<PipelineWithStages | null> {
  const rows = await db
    .select()
    .from(pipelines)
    .where(and(eq(pipelines.isEntry, true), isNull(pipelines.archivedAt)))
  const [pipeline] = await withStages(db, rows)
  return pipeline ?? null
}

export async function create(db: Db, name: string): Promise<PipelineWithStages> {
  try {
    const id = await inTransaction(db, async (tx) => {
      const [pipeline] = await tx.insert(pipelines).values({ name: name.trim() }).returning({ id: pipelines.id })
      await tx.insert(pipelineStages).values(DEFAULT_STAGES.map((stage, position) => ({ ...stage, position, pipelineId: pipeline!.id })))
      return pipeline!.id
    })
    return (await findById(db, id))!
  } catch (error) {
    if (isUniqueViolation(error)) throw nameTaken()
    throw error
  }
}

/** Rename, archive/reactivate and entry flag. At most one active entry pipeline (partial unique index). */
export async function update(
  db: Db,
  id: string,
  changes: { name?: string; isEntry?: boolean; archived?: boolean },
): Promise<PipelineWithStages | null> {
  try {
    const found = await inTransaction(db, async (tx) => {
      const [current] = await tx.select().from(pipelines).where(eq(pipelines.id, id))
      if (!current) return false
      const archivedAt = changes.archived === undefined ? current.archivedAt : changes.archived ? new Date() : null
      if (changes.isEntry && archivedAt) throw conflict('PIPELINE_ARCHIVED', 'Um funil arquivado não pode ser o funil de entrada.')
      if (changes.isEntry) await tx.update(pipelines).set({ isEntry: false }).where(eq(pipelines.isEntry, true))
      await tx
        .update(pipelines)
        .set({
          ...(changes.name === undefined ? {} : { name: changes.name.trim() }),
          archivedAt,
          isEntry: archivedAt ? false : (changes.isEntry ?? current.isEntry),
        })
        .where(eq(pipelines.id, id))
      return true
    })
    return found ? findById(db, id) : null
  } catch (error) {
    if (isUniqueViolation(error)) throw nameTaken()
    throw error
  }
}
