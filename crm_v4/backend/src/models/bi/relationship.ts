import { asc, eq, or } from 'drizzle-orm'
import type { Db } from '../../db/client.js'
import { biRelationships, type BiRelationshipRow } from '../../db/schema-bi.js'
import { conflict } from '../../lib/errors.js'
import { isUniqueViolation } from '../../lib/db-errors.js'

export type NewRelationship = Pick<BiRelationshipRow, 'leftSourceId' | 'leftField' | 'rightSourceId' | 'rightField'>

/** A relationship seen from one of its sources. */
export type Link = { otherSourceId: string; localField: string; remoteField: string }

export async function createRelationship(db: Db, input: NewRelationship): Promise<BiRelationshipRow> {
  try {
    const [row] = await db.insert(biRelationships).values(input).returning()
    return row!
  } catch (error) {
    if (isUniqueViolation(error)) throw conflict('RELATIONSHIP_EXISTS', 'Essas duas fontes já estão relacionadas por esses campos.')
    throw error
  }
}

export async function listRelationships(db: Db): Promise<BiRelationshipRow[]> {
  return db.select().from(biRelationships).orderBy(asc(biRelationships.createdAt))
}

export async function deleteRelationship(db: Db, id: string): Promise<void> {
  await db.delete(biRelationships).where(eq(biRelationships.id, id))
}

export async function deleteRelationshipsOf(db: Db, sourceId: string): Promise<void> {
  await db.delete(biRelationships).where(or(eq(biRelationships.leftSourceId, sourceId), eq(biRelationships.rightSourceId, sourceId)))
}

export async function linksOf(db: Db, sourceId: string): Promise<Link[]> {
  const rows = await db
    .select()
    .from(biRelationships)
    .where(or(eq(biRelationships.leftSourceId, sourceId), eq(biRelationships.rightSourceId, sourceId)))
  return rows.map((row) =>
    row.leftSourceId === sourceId
      ? { otherSourceId: row.rightSourceId, localField: row.leftField, remoteField: row.rightField }
      : { otherSourceId: row.leftSourceId, localField: row.rightField, remoteField: row.leftField },
  )
}
