import { and, asc, desc, eq, inArray, isNotNull, lt, lte, notInArray, or, sql } from 'drizzle-orm'
import type { Db } from '../db/client.js'
import {
  contacts,
  conversations,
  flowRuns,
  flowRunSteps,
  flows,
  flowVersions,
  type FlowRunRow,
  type FlowRunStepRow,
} from '../db/schema.js'
import { conflict } from '../lib/errors.js'
import { isUniqueViolation } from '../lib/db-errors.js'

export type RunStatus = FlowRunRow['status']
export type RunOrigin = FlowRunRow['origin']
export type RunEndReason = 'completed' | 'handoff' | 'opt_out' | 'flow_deactivated' | 'stopped_by_user' | 'loop_limit' | 'error'

export const ACTIVE_STATUSES: RunStatus[] = ['running', 'waiting']
export const STEP_PAYLOAD_MAX_BYTES = 8 * 1024
const TRUNCATED = '…(truncado)'

/** Run plus what lists and the chat need to show it without extra queries. */
export type RunWithContext = FlowRunRow & {
  flowName: string
  versionNumber: number
  contact: { name: string | null; phone: string }
}

export type RunDetail = RunWithContext & { graph: unknown; steps: FlowRunStepRow[] }

const alreadyActive = () => conflict('RUN_ALREADY_ACTIVE', 'Já existe uma automação em andamento nesta conversa.')

function selectWithContext(db: Db) {
  return db
    .select({
      run: flowRuns,
      flowName: flows.name,
      versionNumber: flowVersions.number,
      contact: { name: contacts.name, phone: contacts.phone },
    })
    .from(flowRuns)
    .innerJoin(flows, eq(flows.id, flowRuns.flowId))
    .innerJoin(flowVersions, eq(flowVersions.id, flowRuns.versionId))
    .innerJoin(conversations, eq(conversations.id, flowRuns.conversationId))
    .innerJoin(contacts, eq(contacts.id, conversations.contactId))
}

type Joined = { run: FlowRunRow; flowName: string; versionNumber: number; contact: { name: string | null; phone: string } }
const toRun = (row: Joined): RunWithContext => ({ ...row.run, flowName: row.flowName, versionNumber: row.versionNumber, contact: row.contact })

/** One active run per conversation, enforced by a partial unique index (FR-009). */
export async function create(
  db: Db,
  input: { flowId: string; versionId: string; conversationId: string; origin: RunOrigin; startedByUserId: string | null; currentNodeId: string },
): Promise<RunWithContext> {
  try {
    const [row] = await db
      .insert(flowRuns)
      .values({ ...input, status: 'running' })
      .returning({ id: flowRuns.id })
    return (await findById(db, row!.id))!
  } catch (error) {
    if (isUniqueViolation(error)) throw alreadyActive()
    throw error
  }
}

export async function findById(db: Db, id: string): Promise<RunWithContext | null> {
  const [row] = await selectWithContext(db).where(eq(flowRuns.id, id))
  return row ? toRun(row) : null
}

export async function findActiveByConversation(db: Db, conversationId: string): Promise<RunWithContext | null> {
  const [row] = await selectWithContext(db).where(and(eq(flowRuns.conversationId, conversationId), inArray(flowRuns.status, ACTIVE_STATUSES)))
  return row ? toRun(row) : null
}

type RunPatch = Partial<
  Pick<FlowRunRow, 'status' | 'currentNodeId' | 'state' | 'resumeAt' | 'leaseUntil' | 'stepsCount' | 'endReason' | 'error' | 'finishedAt'>
>

/** Terminal runs never change again. Returns null when the run is gone or already finished. */
export async function update(db: Db, id: string, patch: RunPatch): Promise<RunWithContext | null> {
  const [row] = await db
    .update(flowRuns)
    .set(patch)
    .where(and(eq(flowRuns.id, id), inArray(flowRuns.status, ACTIVE_STATUSES)))
    .returning({ id: flowRuns.id })
  return row ? findById(db, row.id) : null
}

export async function finish(
  db: Db,
  id: string,
  result: { status: 'completed' | 'failed' | 'cancelled'; endReason: RunEndReason; error?: string | null },
): Promise<RunWithContext | null> {
  return update(db, id, {
    status: result.status,
    endReason: result.endReason,
    error: result.error ?? null,
    finishedAt: new Date(),
    resumeAt: null,
    leaseUntil: null,
  })
}

/**
 * Takes runs due for work: waiting ones whose resume time passed, and running ones whose lease
 * expired (the process died mid-run, FR-012). SKIP LOCKED lets several workers share the queue.
 */
export async function claimDue(db: Db, now: Date, leaseMs: number, limit: number): Promise<FlowRunRow[]> {
  const leaseUntil = new Date(now.getTime() + leaseMs)
  const due = or(
    and(eq(flowRuns.status, 'waiting'), lte(flowRuns.resumeAt, now)),
    and(eq(flowRuns.status, 'running'), lt(flowRuns.leaseUntil, now)),
  )
  return db.transaction(async (tx) => {
    const ids = await tx.select({ id: flowRuns.id }).from(flowRuns).where(due).orderBy(asc(flowRuns.resumeAt)).limit(limit).for('update', { skipLocked: true })
    if (ids.length === 0) return []
    return tx
      .update(flowRuns)
      .set({ status: 'running', leaseUntil })
      .where(inArray(flowRuns.id, ids.map((r) => r.id)))
      .returning()
  })
}

/** Takes one specific run for immediate work (trigger, reply). Null if someone else holds it. */
export async function claim(db: Db, id: string, now: Date, leaseMs: number): Promise<FlowRunRow | null> {
  const [row] = await db
    .update(flowRuns)
    .set({ status: 'running', leaseUntil: new Date(now.getTime() + leaseMs) })
    .where(
      and(
        eq(flowRuns.id, id),
        or(eq(flowRuns.status, 'waiting'), and(eq(flowRuns.status, 'running'), or(sql`${flowRuns.leaseUntil} IS NULL`, lt(flowRuns.leaseUntil, now)))),
      ),
    )
    .returning()
  return row ?? null
}

function truncateJson(value: unknown): unknown {
  if (value === undefined || value === null) return null
  const text = JSON.stringify(value)
  return Buffer.byteLength(text) <= STEP_PAYLOAD_MAX_BYTES ? value : `${text.slice(0, STEP_PAYLOAD_MAX_BYTES)}${TRUNCATED}`
}

export async function addStep(
  db: Db,
  step: Pick<FlowRunStepRow, 'runId' | 'nodeId' | 'nodeType' | 'status'> & {
    input?: unknown
    output?: unknown
    error?: string | null
    startedAt: Date
  },
): Promise<void> {
  await db.insert(flowRunSteps).values({
    ...step,
    input: truncateJson(step.input),
    output: truncateJson(step.output),
    error: step.error ?? null,
    finishedAt: new Date(),
  })
}

/** Cancels the active runs of a flow (deactivation). Returns their ids. */
export async function cancelActiveForFlow(db: Db, flowId: string, endReason: RunEndReason): Promise<string[]> {
  const rows = await db
    .update(flowRuns)
    .set({ status: 'cancelled', endReason, finishedAt: new Date(), resumeAt: null, leaseUntil: null })
    .where(and(eq(flowRuns.flowId, flowId), inArray(flowRuns.status, ACTIVE_STATUSES)))
    .returning({ id: flowRuns.id })
  return rows.map((r) => r.id)
}

const encodeCursor = (at: Date, id: string) => Buffer.from(`${at.toISOString()}|${id}`).toString('base64url')
function decodeCursor(cursor: string) {
  const [at, id] = Buffer.from(cursor, 'base64url').toString().split('|')
  return at && id ? { at, id } : null
}

export async function listByFlow(
  db: Db,
  flowId: string,
  options: { status?: RunStatus; cursor?: string; limit: number },
): Promise<{ items: RunWithContext[]; nextCursor: string | null }> {
  const cursor = options.cursor ? decodeCursor(options.cursor) : null
  const rows = await selectWithContext(db)
    .where(
      and(
        eq(flowRuns.flowId, flowId),
        options.status ? eq(flowRuns.status, options.status) : undefined,
        cursor ? sql`(${flowRuns.startedAt}, ${flowRuns.id}) < (${cursor.at}::timestamptz, ${cursor.id}::uuid)` : undefined,
      ),
    )
    .orderBy(desc(flowRuns.startedAt), desc(flowRuns.id))
    .limit(options.limit + 1)
  const page = rows.slice(0, options.limit).map(toRun)
  const last = page.at(-1)
  return { items: page, nextCursor: rows.length > options.limit && last ? encodeCursor(last.startedAt, last.id) : null }
}

/** For the chat: the active run first, then the latest ones. */
export async function listByConversation(db: Db, conversationId: string, limit = 20): Promise<RunWithContext[]> {
  const rows = await selectWithContext(db)
    .where(eq(flowRuns.conversationId, conversationId))
    .orderBy(sql`${flowRuns.status} IN ('running', 'waiting') DESC`, desc(flowRuns.startedAt))
    .limit(limit)
  return rows.map(toRun)
}

export async function findDetail(db: Db, id: string): Promise<RunDetail | null> {
  const run = await findById(db, id)
  if (!run) return null
  const [version] = await db.select({ graph: flowVersions.graph }).from(flowVersions).where(eq(flowVersions.id, run.versionId))
  const steps = await db.select().from(flowRunSteps).where(eq(flowRunSteps.runId, id)).orderBy(asc(flowRunSteps.startedAt), asc(flowRunSteps.createdAt))
  return { ...run, graph: version?.graph ?? null, steps }
}

/** Retention (FR-013). Steps go with their runs (cascade). */
export async function deleteFinishedBefore(db: Db, before: Date): Promise<number> {
  const rows = await db
    .delete(flowRuns)
    .where(and(isNotNull(flowRuns.finishedAt), lt(flowRuns.finishedAt, before)))
    .returning({ id: flowRuns.id })
  return rows.length
}

/** Versions that are not current and have no runs left are never needed again. */
export async function deleteOrphanVersions(db: Db): Promise<number> {
  const inUse = db.select({ id: flowRuns.versionId }).from(flowRuns)
  const current = db.select({ id: flows.currentVersionId }).from(flows).where(isNotNull(flows.currentVersionId))
  const rows = await db
    .delete(flowVersions)
    .where(and(notInArray(flowVersions.id, inUse), notInArray(flowVersions.id, sql`(${current})`)))
    .returning({ id: flowVersions.id })
  return rows.length
}
