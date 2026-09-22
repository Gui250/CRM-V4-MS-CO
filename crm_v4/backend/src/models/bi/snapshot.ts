// Captures of external sources (research §1). A capture becomes current only when it finishes, so a
// failed refresh never replaces the data reports are showing (FR-028).
import { and, eq, lt, ne } from 'drizzle-orm'
import type { Db } from '../../db/client.js'
import { biSnapshotRows, biSnapshots, biSources, type BiSnapshotRow } from '../../db/schema-bi.js'
import { conflict } from '../../lib/errors.js'
import type { SourceField } from './definition.js'
import { isUniqueViolation } from '../../lib/db-errors.js'

export async function startSnapshot(db: Db, sourceId: string, now = new Date()): Promise<BiSnapshotRow> {
  try {
    const [snapshot] = await db.insert(biSnapshots).values({ sourceId, startedAt: now }).returning()
    await db.update(biSources).set({ lastAttemptAt: now }).where(eq(biSources.id, sourceId))
    return snapshot!
  } catch (error) {
    if (isUniqueViolation(error)) throw conflict('REFRESH_IN_PROGRESS', 'Esta fonte já está sendo atualizada.')
    throw error
  }
}

export async function appendRows(db: Db, snapshotId: string, firstRowNum: number, rows: Record<string, unknown>[]): Promise<void> {
  if (rows.length === 0) return
  await db.insert(biSnapshotRows).values(rows.map((data, index) => ({ snapshotId, rowNum: firstRowNum + index, data })))
}

/** Makes the capture current, stores the fields it was read with and drops older captures. */
export async function finishSnapshotSuccess(
  db: Db,
  snapshot: Pick<BiSnapshotRow, 'id' | 'sourceId'>,
  result: { rowCount: number; fields: SourceField[] },
  now = new Date(),
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.update(biSnapshots).set({ status: 'succeeded', rowCount: result.rowCount, finishedAt: now }).where(eq(biSnapshots.id, snapshot.id))
    await tx
      .update(biSources)
      .set({ currentSnapshotId: snapshot.id, fields: result.fields, lastError: null })
      .where(eq(biSources.id, snapshot.sourceId))
    await tx.delete(biSnapshots).where(and(eq(biSnapshots.sourceId, snapshot.sourceId), ne(biSnapshots.id, snapshot.id)))
  })
}

/** Records the failure on the source; the current capture stays untouched. */
export async function finishSnapshotFailure(db: Db, snapshot: Pick<BiSnapshotRow, 'id' | 'sourceId'>, error: string, now = new Date()) {
  await db.transaction(async (tx) => {
    await tx.delete(biSnapshotRows).where(eq(biSnapshotRows.snapshotId, snapshot.id))
    await tx.update(biSnapshots).set({ status: 'failed', error, finishedAt: now }).where(eq(biSnapshots.id, snapshot.id))
    await tx.update(biSources).set({ lastError: error }).where(eq(biSources.id, snapshot.sourceId))
  })
}

/**
 * A capture still "running" long after it started was interrupted (e.g. the server restarted);
 * failing it releases the one-running-capture lock so the source can refresh again.
 */
export async function failStaleSnapshots(db: Db, startedBefore: Date, now = new Date()): Promise<number> {
  const stale = await db
    .select({ id: biSnapshots.id, sourceId: biSnapshots.sourceId })
    .from(biSnapshots)
    .where(and(eq(biSnapshots.status, 'running'), lt(biSnapshots.startedAt, startedBefore)))
  for (const snapshot of stale) {
    await finishSnapshotFailure(db, snapshot, 'A atualização foi interrompida. Tente novamente.', now)
  }
  return stale.length
}
