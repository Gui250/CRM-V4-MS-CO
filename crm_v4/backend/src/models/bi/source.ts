import { and, asc, eq, isNotNull, lte, sql } from 'drizzle-orm'
import type { Db } from '../../db/client.js'
import { biSnapshots, biSources, type BiSourceRow } from '../../db/schema-bi.js'
import { conflict } from '../../lib/errors.js'
import type { SourceField } from './definition.js'
import { isUniqueViolation } from '../../lib/db-errors.js'

export type SourceKind = BiSourceRow['kind']
export type RefreshInterval = BiSourceRow['refreshInterval']

/** Source plus what the UI shows about its current capture. */
export type SourceWithStatus = BiSourceRow & { rowCount: number; lastRefreshedAt: Date | null; isRefreshing: boolean }

const INTERVAL_MS: Record<Exclude<RefreshInterval, 'manual'>, number> = {
  '15m': 15 * 60_000,
  '1h': 60 * 60_000,
  '6h': 6 * 60 * 60_000,
  '24h': 24 * 60 * 60_000,
}

export const nextRefreshAt = (interval: RefreshInterval, now: Date): Date | null =>
  interval === 'manual' ? null : new Date(now.getTime() + INTERVAL_MS[interval])

const nameTaken = () => conflict('SOURCE_NAME_TAKEN', 'Já existe uma fonte de dados com esse nome.')

export type NewSource = {
  name: string
  kind: SourceKind
  config: Record<string, unknown>
  secretsEncrypted: string | null
  refreshInterval: RefreshInterval
  createdBy: string
}

export async function createSource(db: Db, input: NewSource, now = new Date()): Promise<BiSourceRow> {
  try {
    const [row] = await db
      .insert(biSources)
      .values({ ...input, nextRefreshAt: nextRefreshAt(input.refreshInterval, now) })
      .returning()
    return row!
  } catch (error) {
    if (isUniqueViolation(error)) throw nameTaken()
    throw error
  }
}

export type SourceChanges = Partial<Pick<BiSourceRow, 'name' | 'config' | 'secretsEncrypted' | 'refreshInterval' | 'fields'>>

export async function updateSource(db: Db, id: string, changes: SourceChanges, now = new Date()): Promise<BiSourceRow> {
  const schedule = changes.refreshInterval ? { nextRefreshAt: nextRefreshAt(changes.refreshInterval, now) } : {}
  try {
    const [row] = await db
      .update(biSources)
      .set({ ...changes, ...schedule })
      .where(eq(biSources.id, id))
      .returning()
    return row!
  } catch (error) {
    if (isUniqueViolation(error)) throw nameTaken()
    throw error
  }
}

const statusColumns = {
  source: biSources,
  rowCount: sql<number>`coalesce(${biSnapshots.rowCount}, 0)`.mapWith(Number),
  lastRefreshedAt: biSnapshots.finishedAt,
  isRefreshing: sql<boolean>`EXISTS (SELECT 1 FROM bi_snapshots r WHERE r.source_id = ${biSources.id} AND r.status = 'running')`,
}

type StatusRow = { source: BiSourceRow; rowCount: number; lastRefreshedAt: Date | string | null; isRefreshing: boolean }

const withStatus = ({ source, rowCount, lastRefreshedAt, isRefreshing }: StatusRow): SourceWithStatus => ({
  ...source,
  rowCount,
  lastRefreshedAt: lastRefreshedAt === null ? null : new Date(lastRefreshedAt),
  isRefreshing: Boolean(isRefreshing),
})

export async function listSources(db: Db): Promise<SourceWithStatus[]> {
  const rows = await db
    .select(statusColumns)
    .from(biSources)
    .leftJoin(biSnapshots, eq(biSnapshots.id, biSources.currentSnapshotId))
    .orderBy(asc(biSources.name))
  return rows.map(withStatus)
}

export async function getSource(db: Db, id: string): Promise<SourceWithStatus | null> {
  const [row] = await db
    .select(statusColumns)
    .from(biSources)
    .leftJoin(biSnapshots, eq(biSnapshots.id, biSources.currentSnapshotId))
    .where(eq(biSources.id, id))
  return row ? withStatus(row) : null
}

export async function deleteSource(db: Db, id: string): Promise<void> {
  await db.delete(biSources).where(eq(biSources.id, id))
}

export async function setFields(db: Db, id: string, fields: SourceField[]): Promise<void> {
  await db.update(biSources).set({ fields }).where(eq(biSources.id, id))
}

/**
 * Takes the sources due for a scheduled refresh and pushes their next run forward in the same
 * transaction, so a second scheduler tick (or instance) never picks them twice.
 */
export async function claimDueSources(db: Db, now: Date, limit = 10): Promise<BiSourceRow[]> {
  return db.transaction(async (tx) => {
    const due = await tx
      .select()
      .from(biSources)
      .where(
        and(
          isNotNull(biSources.nextRefreshAt),
          lte(biSources.nextRefreshAt, now),
          sql`NOT EXISTS (SELECT 1 FROM bi_snapshots r WHERE r.source_id = ${biSources.id} AND r.status = 'running')`,
        ),
      )
      .orderBy(asc(biSources.nextRefreshAt))
      .limit(limit)
      .for('update', { skipLocked: true })
    for (const source of due) {
      await tx.update(biSources).set({ nextRefreshAt: nextRefreshAt(source.refreshInterval, now) }).where(eq(biSources.id, source.id))
    }
    return due
  })
}
