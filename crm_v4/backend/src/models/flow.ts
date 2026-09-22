import { and, asc, eq, max, sql, type SQL } from 'drizzle-orm'
import type { Db } from '../db/client.js'
import { flowRuns, flows, flowVersions, type FlowRow, type FlowVersionRow } from '../db/schema.js'
import { conflict } from '../lib/errors.js'
import { isUniqueViolation } from '../lib/db-errors.js'

export type FlowStatus = FlowRow['status']
export type FlowTrigger = NonNullable<FlowRow['triggerType']>

/** The graph is stored as validated JSON (controllers/automation/graph-schema.ts); models keep it opaque. */
export type FlowWithVersion = FlowRow & { versionNumber: number | null; graph: unknown; lastRunAt: Date | null }

const nameTaken = () => conflict('FLOW_NAME_TAKEN', 'Já existe um fluxo com este nome.')

const lastRunAt = sql<Date | null>`(select max(${flowRuns.startedAt}) from ${flowRuns} where ${flowRuns.flowId} = ${flows.id})`.mapWith(
  (value: string | Date | null) => (value === null ? null : new Date(value)),
)

function selectWithVersion(db: Db) {
  return db
    .select({ flow: flows, versionNumber: flowVersions.number, graph: flowVersions.graph, lastRunAt })
    .from(flows)
    .leftJoin(flowVersions, eq(flowVersions.id, flows.currentVersionId))
}

type Joined = { flow: FlowRow; versionNumber: number | null; graph: unknown; lastRunAt: Date | null }
const toFlow = (row: Joined): FlowWithVersion => ({ ...row.flow, versionNumber: row.versionNumber, graph: row.graph, lastRunAt: row.lastRunAt })

async function withUniqueName<T>(write: () => Promise<T>): Promise<T> {
  try {
    return await write()
  } catch (error) {
    if (isUniqueViolation(error)) throw nameTaken()
    throw error
  }
}

export async function create(db: Db, input: { name: string; description: string | null; userId: string }): Promise<FlowWithVersion> {
  const [row] = await withUniqueName(() =>
    db
      .insert(flows)
      .values({ name: input.name, description: input.description, createdByUserId: input.userId, updatedByUserId: input.userId })
      .returning({ id: flows.id }),
  )
  return (await findById(db, row!.id))!
}

export async function findById(db: Db, id: string): Promise<FlowWithVersion | null> {
  const [row] = await selectWithVersion(db).where(eq(flows.id, id))
  return row ? toFlow(row) : null
}

export async function list(db: Db, filters: { status?: FlowStatus; trigger?: FlowTrigger } = {}): Promise<FlowWithVersion[]> {
  const conditions: SQL[] = []
  if (filters.status) conditions.push(eq(flows.status, filters.status))
  if (filters.trigger) conditions.push(eq(flows.triggerType, filters.trigger))
  const rows = await selectWithVersion(db)
    .where(and(...conditions))
    .orderBy(asc(flows.priority), asc(flows.name))
  return rows.map(toFlow)
}

export async function update(
  db: Db,
  id: string,
  patch: { name?: string; description?: string | null; priority?: number; userId: string },
): Promise<FlowWithVersion | null> {
  const { userId, ...fields } = patch
  await withUniqueName(() =>
    db
      .update(flows)
      .set({ ...fields, updatedByUserId: userId })
      .where(eq(flows.id, id)),
  )
  return findById(db, id)
}

/** Every save is a new immutable version (FR-007); numbers are 1, 2, 3… per flow. */
export async function saveVersion(
  db: Db,
  input: { flowId: string; graph: unknown; triggerType: FlowTrigger | null; userId: string },
): Promise<FlowVersionRow> {
  return db.transaction(async (tx) => {
    // Serializes concurrent saves of the same flow so version numbers never collide.
    await tx.execute(sql`select 1 from ${flows} where ${flows.id} = ${input.flowId} for update`)
    const [current] = await tx.select({ number: max(flowVersions.number) }).from(flowVersions).where(eq(flowVersions.flowId, input.flowId))
    const [version] = await tx
      .insert(flowVersions)
      .values({ flowId: input.flowId, number: (current?.number ?? 0) + 1, graph: input.graph, createdByUserId: input.userId })
      .returning()
    await tx
      .update(flows)
      .set({ currentVersionId: version!.id, triggerType: input.triggerType, updatedByUserId: input.userId })
      .where(eq(flows.id, input.flowId))
    return version!
  })
}

export async function findVersion(db: Db, versionId: string): Promise<FlowVersionRow | null> {
  const [row] = await db.select().from(flowVersions).where(eq(flowVersions.id, versionId))
  return row ?? null
}

export async function setStatus(db: Db, id: string, status: FlowStatus, userId: string): Promise<void> {
  await db
    .update(flows)
    .set({ status, updatedByUserId: userId, ...(status === 'active' ? { activatedAt: new Date() } : {}) })
    .where(eq(flows.id, id))
}

export async function remove(db: Db, id: string): Promise<void> {
  await db.delete(flows).where(eq(flows.id, id))
}

/** Candidates for an inbound message, highest priority first (FR-008). */
export async function listActiveByTrigger(db: Db, trigger: FlowTrigger): Promise<FlowWithVersion[]> {
  const rows = await selectWithVersion(db)
    .where(and(eq(flows.status, 'active'), eq(flows.triggerType, trigger)))
    .orderBy(asc(flows.priority), asc(flows.activatedAt))
  return rows.map(toFlow)
}

/** Active flows whose current graph has an ai_agent block using this agent. */
export async function findActiveReferencingAgent(db: Db, agentId: string): Promise<Pick<FlowRow, 'id' | 'name'>[]> {
  return db
    .select({ id: flows.id, name: flows.name })
    .from(flows)
    .innerJoin(flowVersions, eq(flowVersions.id, flows.currentVersionId))
    .where(
      and(
        eq(flows.status, 'active'),
        sql`${flowVersions.graph} -> 'nodes' @> ${JSON.stringify([{ type: 'ai_agent', config: { agentId } }])}::jsonb`,
      ),
    )
    .orderBy(asc(flows.name))
}
