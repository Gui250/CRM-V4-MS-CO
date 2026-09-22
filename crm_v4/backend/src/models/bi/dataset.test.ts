import { describe, expect, it } from 'vitest'
import { biSources } from '../../db/schema-bi.js'
import { createTestDb } from '../../test/db.js'
import { seedSnapshotSource, sourceField } from '../../test/bi-fixtures.js'
import { datasetFor } from './dataset.js'

describe('datasetFor', () => {
  it('resolves internal sources as live data', async () => {
    const db = await createTestDb()
    const dataset = await datasetFor(db, 'internal:whatsapp_messages')
    expect(dataset).toMatchObject({ name: 'Mensagens do WhatsApp', dataAsOf: null, lastError: null })
  })

  it('resolves external sources through their current snapshot', async () => {
    const db = await createTestDb()
    const source = await seedSnapshotSource(db, { name: 'Vendas', fields: [sourceField('valor', 'number')], rows: [], lastError: 'API fora do ar' })
    const dataset = await datasetFor(db, source.id)
    expect(dataset).toMatchObject({ sourceId: source.id, name: 'Vendas', lastError: 'API fora do ar' })
    expect(dataset.dataAsOf?.toISOString()).toBe('2026-03-01T12:00:00.000Z')
    expect(dataset.fields.map((field) => field.key)).toEqual(['valor'])
  })

  it.each(['internal:nope', 'not-a-uuid', '00000000-0000-0000-0000-000000000000'])('rejects unknown source %s', async (id) => {
    const db = await createTestDb()
    await expect(datasetFor(db, id)).rejects.toMatchObject({ code: 'SOURCE_NOT_FOUND', httpStatus: 404 })
  })

  it('rejects an external source whose first capture has not finished', async () => {
    const db = await createTestDb()
    const [source] = await db.insert(biSources).values({ name: 'Nova', kind: 'api', config: {} }).returning()
    await expect(datasetFor(db, source!.id)).rejects.toMatchObject({ code: 'SOURCE_NOT_FOUND' })
  })
})
