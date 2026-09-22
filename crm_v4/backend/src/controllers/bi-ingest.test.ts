import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BiSourceRow } from '../db/schema-bi.js'
import type { BiConnectors } from '../integrations/bi-connectors/index.js'
import * as snapshots from '../models/bi/snapshot.js'
import { fakeContext } from '../test/context.js'
import { ingest, keysOf, RowNormalizer } from './bi-ingest.js'

vi.mock('../models/bi/snapshot.js')
vi.mock('../models/bi/limits.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../models/bi/limits.js')>()),
  MAX_SOURCE_ROWS: 3,
  INGEST_BATCH_ROWS: 2,
  TYPE_SAMPLE_ROWS: 2,
}))

const source = { id: 's', kind: 'api', config: {}, secretsEncrypted: null, fields: [] } as unknown as BiSourceRow
const snapshot = { id: 'snap', sourceId: 's' }

function contextWith(rows: Record<string, unknown>[]) {
  async function* read() {
    yield* rows
  }
  return fakeContext({ biConnectors: { read, listSheets: vi.fn() } as unknown as BiConnectors } as never).ctx
}

beforeEach(() => vi.mocked(snapshots.appendRows).mockResolvedValue())

describe('ingest', () => {
  it('writes normalized rows in batches with consecutive row numbers', async () => {
    await ingest(contextWith([{ a: '1' }, { a: '2' }, { a: 'x' }]), source, snapshot)
    expect(vi.mocked(snapshots.appendRows).mock.calls.map((call) => [call[2], call[3]])).toEqual([
      [0, [{ a: 1 }, { a: 2 }]],
      [2, [{ a: null }]],
    ])
    expect(snapshots.finishSnapshotSuccess).toHaveBeenCalledWith(expect.anything(), snapshot, {
      rowCount: 3,
      fields: [expect.objectContaining({ key: 'a', type: 'number', invalidCount: 1 })],
    })
  })

  it('fails the capture past the row limit and keeps the current data', async () => {
    await ingest(contextWith([{ a: 1 }, { a: 2 }, { a: 3 }, { a: 4 }]), source, snapshot)
    expect(snapshots.finishSnapshotSuccess).not.toHaveBeenCalled()
    expect(snapshots.finishSnapshotFailure).toHaveBeenCalledWith(expect.anything(), snapshot, 'A fonte passa de 500.000 linhas.')
  })

  it('records a generic message and logs unexpected errors', async () => {
    const ctx = contextWith([])
    ctx.biConnectors.read = () => {
      throw new Error('boom')
    }
    await ingest(ctx, source, snapshot)
    expect(snapshots.finishSnapshotFailure).toHaveBeenCalledWith(expect.anything(), snapshot, expect.stringContaining('Falha inesperada'))
    expect(ctx.log.error).toHaveBeenCalled()
  })

  it('collects keys in first-seen order and counts invalid values', () => {
    expect(keysOf([{ b: 1 }, { a: 1, b: 2 }])).toEqual(['b', 'a'])
    const normalizer = new RowNormalizer([{ key: 'n', label: 'n', type: 'number', detectedType: 'number', invalidCount: 0 }])
    normalizer.normalize({ n: 'x' })
    expect(normalizer.fieldsWithCounts()[0]!.invalidCount).toBe(1)
  })
})
