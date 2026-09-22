import { and, desc, eq, inArray, or, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import type { Db } from '../../db/client.js'
import { users } from '../../db/schema.js'
import { reportShares, reports, type ReportRow } from '../../db/schema-bi.js'
import type { ReportDefinition } from './definition.js'

export type ReportPermission = 'owner' | 'edit' | 'view'
export type Viewer = { id: string; role: 'admin' | 'attendant' }

export type ReportWithNames = ReportRow & { ownerName: string; updatedByName: string | null }
export type ReportSummary = { id: string; name: string; ownerName: string; permission: ReportPermission; updatedAt: Date }

const updater = alias(users, 'updater')

export async function createReport(db: Db, input: { name: string; ownerId: string; definition: ReportDefinition }): Promise<ReportRow> {
  const [row] = await db
    .insert(reports)
    .values({ ...input, updatedBy: input.ownerId })
    .returning()
  return row!
}

export async function getReport(db: Db, id: string): Promise<ReportWithNames | null> {
  const [row] = await db
    .select({ report: reports, ownerName: users.name, updatedByName: updater.name })
    .from(reports)
    .innerJoin(users, eq(users.id, reports.ownerId))
    .leftJoin(updater, eq(updater.id, reports.updatedBy))
    .where(eq(reports.id, id))
  return row ? { ...row.report, ownerName: row.ownerName, updatedByName: row.updatedByName } : null
}

/** Own reports and those shared with the viewer; admins see every report (with edit rights). */
export async function listReportsForUser(db: Db, viewer: Viewer): Promise<ReportSummary[]> {
  const rows = await db
    .select({ id: reports.id, name: reports.name, ownerId: reports.ownerId, ownerName: users.name, updatedAt: reports.updatedAt, shared: reportShares.permission })
    .from(reports)
    .innerJoin(users, eq(users.id, reports.ownerId))
    .leftJoin(reportShares, and(eq(reportShares.reportId, reports.id), eq(reportShares.userId, viewer.id)))
    .where(viewer.role === 'admin' ? undefined : or(eq(reports.ownerId, viewer.id), eq(reportShares.userId, viewer.id)))
    .orderBy(desc(reports.updatedAt))
  return rows.map(({ ownerId, shared, ...row }) => ({
    ...row,
    permission: ownerId === viewer.id ? 'owner' : viewer.role === 'admin' ? 'edit' : (shared ?? 'view'),
  }))
}

/**
 * Saves the whole report. With `expectedVersion` it only writes when nobody saved in between and
 * returns null otherwise; without it (explicit overwrite) it always writes.
 */
export async function saveReport(
  db: Db,
  id: string,
  input: { name: string; definition: ReportDefinition; expectedVersion: number | null; userId: string },
): Promise<ReportRow | null> {
  const [row] = await db
    .update(reports)
    .set({ name: input.name, definition: input.definition, updatedBy: input.userId, version: sql`${reports.version} + 1` })
    .where(input.expectedVersion === null ? eq(reports.id, id) : and(eq(reports.id, id), eq(reports.version, input.expectedVersion)))
    .returning()
  return row ?? null
}

export async function deleteReport(db: Db, id: string): Promise<void> {
  await db.delete(reports).where(eq(reports.id, id))
}

/** Reports whose definition mentions the source anywhere (visuals, filters, calculated fields). */
export async function reportsUsingSource(db: Db, sourceId: string): Promise<{ id: string; name: string }[]> {
  return db
    .select({ id: reports.id, name: reports.name })
    .from(reports)
    .where(sql`jsonb_path_exists(${reports.definition}, '$.** ? (@.sourceId == $id)', jsonb_build_object('id', ${sourceId}::text))`)
    .orderBy(reports.name)
}

export async function reportPermission(db: Db, viewer: Viewer, reportId: string): Promise<ReportPermission | null> {
  const [row] = await db
    .select({ ownerId: reports.ownerId, shared: reportShares.permission })
    .from(reports)
    .leftJoin(reportShares, and(eq(reportShares.reportId, reports.id), eq(reportShares.userId, viewer.id)))
    .where(eq(reports.id, reportId))
  if (!row) return null
  if (row.ownerId === viewer.id) return 'owner'
  if (viewer.role === 'admin') return 'edit'
  return row.shared ?? null
}

export const canEdit = (permission: ReportPermission | null) => permission === 'owner' || permission === 'edit'

export async function listShares(db: Db, reportId: string) {
  return db
    .select({ userId: reportShares.userId, userName: users.name, permission: reportShares.permission })
    .from(reportShares)
    .innerJoin(users, eq(users.id, reportShares.userId))
    .where(eq(reportShares.reportId, reportId))
    .orderBy(users.name)
}

/** Replaces all shares atomically. Callers validate the target users first (activeUserIds). */
export async function replaceShares(db: Db, reportId: string, shares: { userId: string; permission: 'edit' | 'view' }[]) {
  await db.transaction(async (tx) => {
    await tx.delete(reportShares).where(eq(reportShares.reportId, reportId))
    if (shares.length > 0) await tx.insert(reportShares).values(shares.map((share) => ({ ...share, reportId })))
  })
}

export async function activeUserIds(db: Db, ids: string[]): Promise<string[]> {
  if (ids.length === 0) return []
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(and(inArray(users.id, ids), eq(users.status, 'active')))
  return rows.map((row) => row.id)
}
