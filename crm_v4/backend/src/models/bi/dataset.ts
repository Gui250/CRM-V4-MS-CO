import { eq, sql, type SQL } from 'drizzle-orm'
import type { Db } from '../../db/client.js'
import { biSnapshots, biSources } from '../../db/schema-bi.js'
import { DomainError } from '../../lib/errors.js'
import type { FieldType, SourceField } from './definition.js'
import { findInternalSource, INTERNAL_PREFIX, type DatasetField } from './internal-sources.js'

/** Everything the query compiler needs to read one source, internal or external. */
export interface Dataset {
  sourceId: string
  name: string
  fields: DatasetField[]
  from: SQL
  /** When the data was captured; null for internal sources, which are live. */
  dataAsOf: Date | null
  lastError: string | null
  lastAttemptAt: Date | null
}

export const sourceNotFound = () => new DomainError('SOURCE_NOT_FOUND', 'Fonte de dados não encontrada.', 404)

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Snapshot values are normalized on ingestion (research §1), so these casts never fail.
const CASTS: Record<FieldType, string> = {
  text: '',
  number: '::numeric',
  currency: '::numeric',
  date: '::timestamptz',
  datetime: '::timestamptz',
  boolean: '::boolean',
}

/** Column expression for a field stored in bi_snapshot_rows.data; the key is a bound parameter. */
export const snapshotFieldExpr = (field: SourceField): SQL =>
  sql`(data->>${field.key}::text)${sql.raw(CASTS[field.type])}`

export function snapshotDataset(
  source: { id: string; name: string; fields: SourceField[]; lastError: string | null; lastAttemptAt: Date | null },
  snapshot: { id: string; finishedAt: Date | null },
): Dataset {
  return {
    sourceId: source.id,
    name: source.name,
    fields: source.fields.map((field) => ({ ...field, expr: snapshotFieldExpr(field) })),
    from: sql`FROM bi_snapshot_rows WHERE snapshot_id = ${snapshot.id}::uuid`,
    dataAsOf: snapshot.finishedAt,
    lastError: source.lastError,
    lastAttemptAt: source.lastAttemptAt,
  }
}

export async function datasetFor(db: Db, sourceId: string): Promise<Dataset> {
  if (sourceId.startsWith(INTERNAL_PREFIX)) {
    const internal = findInternalSource(sourceId)
    if (!internal) throw sourceNotFound()
    return { sourceId, name: internal.name, fields: internal.fields, from: internal.from, dataAsOf: null, lastError: null, lastAttemptAt: null }
  }
  if (!UUID.test(sourceId)) throw sourceNotFound()
  const [row] = await db
    .select({ source: biSources, snapshot: { id: biSnapshots.id, finishedAt: biSnapshots.finishedAt } })
    .from(biSources)
    .innerJoin(biSnapshots, eq(biSnapshots.id, biSources.currentSnapshotId))
    .where(eq(biSources.id, sourceId))
  // A source whose first capture has not finished has nothing to show yet.
  if (!row) throw sourceNotFound()
  return snapshotDataset(row.source, row.snapshot)
}
