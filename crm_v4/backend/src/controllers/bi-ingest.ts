// Refreshing external sources: read the connector, detect field types on a sample, normalize every
// value and store it as a new capture (research §1, §8). Also the scheduler tick.
import type { AppContext } from '../context.js'
import type { BiSourceRow } from '../db/schema-bi.js'
import { decryptSecrets } from '../lib/crypto.js'
import { DomainError } from '../lib/errors.js'
import type { SourceField } from '../models/bi/definition.js'
import { INGEST_BATCH_ROWS, MAX_SOURCE_ROWS, TYPE_SAMPLE_ROWS } from '../models/bi/limits.js'
import * as snapshots from '../models/bi/snapshot.js'
import * as sources from '../models/bi/source.js'
import { buildFields, normalizeValue, type FieldOverrides } from '../models/bi/type-inference.js'

/** A capture still running after this long was interrupted (server restart) and is failed. */
const STALE_REFRESH_MS = 60 * 60_000
const FALLBACK_ERROR = 'Falha inesperada ao atualizar a fonte. Tente novamente.'

export const tooManyRows = () => new DomainError('TOO_MANY_ROWS', 'A fonte passa de 500.000 linhas.', 422)

export function sourceSecrets(ctx: AppContext, source: Pick<BiSourceRow, 'secretsEncrypted'>): Record<string, unknown> {
  return source.secretsEncrypted ? decryptSecrets(source.secretsEncrypted, ctx.config.BI_SECRETS_KEY) : {}
}

/** Column keys in first-seen order across the sample (API items do not all have every key). */
export function keysOf(rows: Record<string, unknown>[]): string[] {
  const keys = new Set<string>()
  for (const row of rows) for (const key of Object.keys(row)) keys.add(key)
  return [...keys]
}

/** Normalizes rows to the field types and counts invalid values per field. */
export class RowNormalizer {
  readonly invalid = new Map<string, number>()
  constructor(readonly fields: SourceField[]) {}

  normalize(raw: Record<string, unknown>): Record<string, unknown> {
    const data: Record<string, unknown> = {}
    for (const field of this.fields) {
      const { value, invalid } = normalizeValue(raw[field.key], field.type)
      data[field.key] = value
      if (invalid) this.invalid.set(field.key, (this.invalid.get(field.key) ?? 0) + 1)
    }
    return data
  }

  fieldsWithCounts(): SourceField[] {
    return this.fields.map((field) => ({ ...field, invalidCount: this.invalid.get(field.key) ?? 0 }))
  }
}

/**
 * Reads the whole source into the capture. Types come from the first 1.000 rows (or the types the
 * user corrected); later rows only follow them. ponytail: keys first seen after the sample are
 * dropped; widen the sample if APIs with sparse keys show up.
 */
async function readIntoSnapshot(ctx: AppContext, source: BiSourceRow, snapshotId: string, overrides: FieldOverrides) {
  const sample: Record<string, unknown>[] = []
  let normalizer: RowNormalizer | undefined
  let batch: Record<string, unknown>[] = []
  let count = 0
  const flush = async () => {
    await snapshots.appendRows(ctx.db, snapshotId, count - batch.length, batch)
    batch = []
  }
  const push = async (raw: Record<string, unknown>) => {
    if (++count > MAX_SOURCE_ROWS) throw tooManyRows()
    batch.push(normalizer!.normalize(raw))
    if (batch.length >= INGEST_BATCH_ROWS) await flush()
  }
  for await (const raw of ctx.biConnectors.read(source.kind, source.config, sourceSecrets(ctx, source))) {
    if (normalizer) {
      await push(raw)
      continue
    }
    sample.push(raw)
    if (sample.length < TYPE_SAMPLE_ROWS) continue
    normalizer = new RowNormalizer(buildFields(keysOf(sample), sample, source.fields, overrides))
    for (const row of sample) await push(row)
  }
  if (!normalizer) {
    normalizer = new RowNormalizer(buildFields(keysOf(sample), sample, source.fields, overrides))
    for (const row of sample) await push(row)
  }
  await flush()
  return { rowCount: count, fields: normalizer.fieldsWithCounts() }
}

/** Runs a capture that was already started; failures are recorded on the source, never thrown. */
export async function ingest(ctx: AppContext, source: BiSourceRow, snapshot: { id: string; sourceId: string }, overrides: FieldOverrides = {}) {
  try {
    const result = await readIntoSnapshot(ctx, source, snapshot.id, overrides)
    await snapshots.finishSnapshotSuccess(ctx.db, snapshot, result)
  } catch (error) {
    const message = error instanceof DomainError ? error.message : FALLBACK_ERROR
    if (!(error instanceof DomainError)) ctx.log.error({ err: error, sourceId: source.id }, 'bi source refresh failed')
    await snapshots.finishSnapshotFailure(ctx.db, snapshot, message)
  }
}

/** Starts a refresh: the conflict check is synchronous (409), the reading runs in background. */
export async function startRefresh(ctx: AppContext, source: BiSourceRow, overrides: FieldOverrides = {}): Promise<{ done: Promise<void> }> {
  const snapshot = await snapshots.startSnapshot(ctx.db, source.id)
  // ingest records its own failures; this only catches the database failing while recording them.
  const done = ingest(ctx, source, snapshot, overrides).catch((error: unknown) => ctx.log.error({ err: error, sourceId: source.id }, 'bi refresh bookkeeping failed'))
  return { done }
}

/** Scheduler tick (server.ts): fails interrupted captures, then refreshes due sources one by one. */
export async function runDueRefreshes(ctx: AppContext, now = new Date()): Promise<void> {
  await snapshots.failStaleSnapshots(ctx.db, new Date(now.getTime() - STALE_REFRESH_MS), now)
  for (const source of await sources.claimDueSources(ctx.db, now)) {
    try {
      await (await startRefresh(ctx, source)).done
    } catch (error) {
      ctx.log.warn({ err: error, sourceId: source.id }, 'scheduled bi refresh skipped')
    }
  }
}
