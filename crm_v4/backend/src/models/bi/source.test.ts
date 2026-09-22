import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Db } from '../../db/client.js'
import { biSnapshotRows, biSnapshots, biSources } from '../../db/schema-bi.js'
import { createTestDb } from '../../test/db.js'
import { seedUser, sourceField } from '../../test/bi-fixtures.js'
import * as relationship from './relationship.js'
import * as snapshot from './snapshot.js'
import * as source from './source.js'

let db: Db
let userId: string
const now = new Date('2026-05-01T12:00:00Z')

const newSource = (name: string, refreshInterval: source.RefreshInterval = 'manual'): source.NewSource => ({
  name,
  kind: 'api',
  config: { url: 'https://api.test' },
  secretsEncrypted: null,
  refreshInterval,
  createdBy: userId,
})

beforeEach(async () => {
  db = await createTestDb()
  userId = (await seedUser(db, 'Admin', 'admin')).id
})

describe('source model', () => {
  it('schedules the next refresh from the interval', () => {
    expect(source.nextRefreshAt('manual', now)).toBeNull()
    expect(source.nextRefreshAt('15m', now)?.toISOString()).toBe('2026-05-01T12:15:00.000Z')
    expect(source.nextRefreshAt('24h', now)?.toISOString()).toBe('2026-05-02T12:00:00.000Z')
  })

  it('creates sources with unique case-insensitive names', async () => {
    const created = await source.createSource(db, newSource('Vendas', '1h'), now)
    expect(created.nextRefreshAt?.toISOString()).toBe('2026-05-01T13:00:00.000Z')
    await expect(source.createSource(db, newSource('VENDAS'))).rejects.toMatchObject({ code: 'SOURCE_NAME_TAKEN', httpStatus: 409 })
  })

  it('updates config and reschedules when the interval changes', async () => {
    const created = await source.createSource(db, newSource('Vendas'))
    const updated = await source.updateSource(db, created.id, { refreshInterval: '6h', config: { url: 'https://b.test' } }, now)
    expect(updated.nextRefreshAt?.toISOString()).toBe('2026-05-01T18:00:00.000Z')
    expect(updated.config).toEqual({ url: 'https://b.test' })
  })

  it('reports row count, last refresh and whether a refresh is running', async () => {
    const created = await source.createSource(db, newSource('Vendas'))
    expect(await source.getSource(db, created.id)).toMatchObject({ rowCount: 0, lastRefreshedAt: null, isRefreshing: false })
    const running = await snapshot.startSnapshot(db, created.id, now)
    expect((await source.listSources(db))[0]).toMatchObject({ isRefreshing: true })
    await snapshot.finishSnapshotSuccess(db, running, { rowCount: 3, fields: [] }, now)
    expect(await source.getSource(db, created.id)).toMatchObject({ rowCount: 3, lastRefreshedAt: now, isRefreshing: false })
  })

  it('claims due sources once and skips those already refreshing', async () => {
    const due = await source.createSource(db, newSource('A', '15m'), new Date('2026-05-01T11:00:00Z'))
    const busy = await source.createSource(db, newSource('B', '15m'), new Date('2026-05-01T11:00:00Z'))
    await source.createSource(db, newSource('C', '15m'), now)
    await snapshot.startSnapshot(db, busy.id)
    expect((await source.claimDueSources(db, now)).map((row) => row.id)).toEqual([due.id])
    expect(await source.claimDueSources(db, now)).toEqual([])
  })
})

describe('snapshot model', () => {
  it('allows one running capture per source', async () => {
    const created = await source.createSource(db, newSource('Vendas'))
    await snapshot.startSnapshot(db, created.id)
    await expect(snapshot.startSnapshot(db, created.id)).rejects.toMatchObject({ code: 'REFRESH_IN_PROGRESS', httpStatus: 409 })
  })

  it('makes a finished capture current and drops the previous one', async () => {
    const created = await source.createSource(db, newSource('Vendas'))
    const first = await snapshot.startSnapshot(db, created.id)
    await snapshot.appendRows(db, first.id, 0, [{ a: 1 }, { a: 2 }])
    await snapshot.finishSnapshotSuccess(db, first, { rowCount: 2, fields: [sourceField('a', 'number')] })
    const second = await snapshot.startSnapshot(db, created.id)
    await snapshot.appendRows(db, second.id, 0, [{ a: 3 }])
    await snapshot.finishSnapshotSuccess(db, second, { rowCount: 1, fields: [sourceField('a', 'number')] })

    const [row] = await db.select().from(biSources).where(eq(biSources.id, created.id))
    expect(row).toMatchObject({ currentSnapshotId: second.id, lastError: null, fields: [sourceField('a', 'number')] })
    expect(await db.select().from(biSnapshots)).toHaveLength(1)
    expect(await db.select().from(biSnapshotRows)).toHaveLength(1)
  })

  it('keeps the current capture when a refresh fails', async () => {
    const created = await source.createSource(db, newSource('Vendas'))
    const good = await snapshot.startSnapshot(db, created.id)
    await snapshot.appendRows(db, good.id, 0, [{ a: 1 }])
    await snapshot.finishSnapshotSuccess(db, good, { rowCount: 1, fields: [] })
    const bad = await snapshot.startSnapshot(db, created.id)
    await snapshot.appendRows(db, bad.id, 0, [{ a: 9 }])
    await snapshot.finishSnapshotFailure(db, bad, 'API fora do ar')

    const [row] = await db.select().from(biSources).where(eq(biSources.id, created.id))
    expect(row).toMatchObject({ currentSnapshotId: good.id, lastError: 'API fora do ar' })
    expect(await db.select().from(biSnapshotRows)).toEqual([{ snapshotId: good.id, rowNum: 0, data: { a: 1 } }])
  })

  it('fails captures left running by an interrupted refresh', async () => {
    const created = await source.createSource(db, newSource('Vendas'))
    await snapshot.startSnapshot(db, created.id, new Date('2026-05-01T08:00:00Z'))
    expect(await snapshot.failStaleSnapshots(db, new Date('2026-05-01T11:00:00Z'))).toBe(1)
    await expect(snapshot.startSnapshot(db, created.id)).resolves.toBeDefined()
  })
})

describe('relationship model', () => {
  it('creates, lists from either side and rejects the same pair twice', async () => {
    const input = { leftSourceId: 'a', leftField: 'tel', rightSourceId: 'internal:x', rightField: 'telefone' }
    const created = await relationship.createRelationship(db, input)
    await expect(
      relationship.createRelationship(db, { leftSourceId: 'internal:x', leftField: 'telefone', rightSourceId: 'a', rightField: 'tel' }),
    ).rejects.toMatchObject({ code: 'RELATIONSHIP_EXISTS' })
    expect(await relationship.linksOf(db, 'internal:x')).toEqual([{ otherSourceId: 'a', localField: 'telefone', remoteField: 'tel' }])
    expect(await relationship.listRelationships(db)).toHaveLength(1)
    await relationship.deleteRelationship(db, created.id)
    expect(await relationship.linksOf(db, 'a')).toEqual([])
  })

  it('rejects relating a source to itself and removes all links of a source', async () => {
    await expect(relationship.createRelationship(db, { leftSourceId: 'a', leftField: 'x', rightSourceId: 'a', rightField: 'y' })).rejects.toThrow()
    await relationship.createRelationship(db, { leftSourceId: 'a', leftField: 'x', rightSourceId: 'b', rightField: 'y' })
    await relationship.deleteRelationshipsOf(db, 'b')
    expect(await relationship.listRelationships(db)).toEqual([])
  })
})
