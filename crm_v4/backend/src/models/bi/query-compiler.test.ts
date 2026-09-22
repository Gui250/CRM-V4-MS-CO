import { sql } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Db } from '../../db/client.js'
import { seedChat, seedSnapshotSource, sourceField } from '../../test/bi-fixtures.js'
import { createTestDb } from '../../test/db.js'
import { datasetFor, type Dataset } from './dataset.js'
import { queryRequestSchema, type QueryRequest } from './definition.js'
import { compileQuery, runQuery, type RelatedDataset } from './query-compiler.js'
import { executeRows } from './sql.js'

const MSG = 'internal:whatsapp_messages'

let db: Db
let sales: Dataset
let salesId: string

const request = (input: Partial<QueryRequest> & { sourceId: string }) => queryRequestSchema.parse(input)
const run = async (req: QueryRequest, related: RelatedDataset[] = []) =>
  runQuery(db, compileQuery({ primary: await datasetFor(db, req.sourceId), related }, req))

beforeEach(async () => {
  db = await createTestDb()
  await seedChat(db)
  const rows = [
    { vendedor: 'Ana', regiao: 'Sul', valor: 100, data: '2026-01-01T03:00:00.000Z', telefone: '55119000000' },
    { vendedor: 'Ana', regiao: 'Sul', valor: 300, data: '2026-01-15T03:00:00.000Z', telefone: '55119000000' },
    { vendedor: 'Bruno', regiao: 'Norte', valor: 50, data: '2026-02-01T03:00:00.000Z', telefone: '55119000001' },
    { vendedor: 'Carla', regiao: 'Sul', valor: 10, data: '2026-02-02T03:00:00.000Z', telefone: '55119000009' },
    { vendedor: 'Diego', regiao: 'Leste', valor: 20, data: '2026-02-03T03:00:00.000Z', telefone: '55119000009' },
    { vendedor: 'Diego', regiao: 'Leste', valor: null, data: '2026-02-04T03:00:00.000Z', telefone: '55119000009' },
  ]
  const source = await seedSnapshotSource(db, {
    name: 'Vendas',
    fields: [sourceField('vendedor', 'text'), sourceField('regiao', 'text'), sourceField('valor', 'currency', 1), sourceField('data', 'date'), sourceField('telefone', 'text')],
    rows,
  })
  salesId = source.id
  sales = await datasetFor(db, salesId)
})

describe('compileQuery on internal sources', () => {
  it('counts messages per attendant', async () => {
    const result = await run(
      request({ sourceId: MSG, dimensions: [{ sourceId: MSG, field: 'atendente' }], measures: [{ sourceId: MSG, field: 'mensagem', aggregation: 'count' }] }),
    )
    expect(result.rows).toEqual([
      ['Ana', 2],
      ['Contato', 2],
      ['Bruno', 1],
    ])
    expect(result.columns.map((column) => column.label)).toEqual(['Atendente', 'Contagem de Mensagem'])
  })

  it('returns a single KPI row without dimensions', async () => {
    const result = await run(request({ sourceId: MSG, measures: [{ sourceId: MSG, field: 'mensagem' }] }))
    expect(result.rows).toEqual([[5]])
  })

  it('groups dates in São Paulo time', async () => {
    const db2 = await createTestDb()
    await seedChat(db2, [{ contact: 'Late', messages: [{ direction: 'inbound', sentAt: '2026-01-01T01:00:00Z' }] }])
    const req = request({ sourceId: MSG, dimensions: [{ sourceId: MSG, field: 'enviada_em', dateGrain: 'day' }], measures: [{ sourceId: MSG, field: 'mensagem' }] })
    const result = await runQuery(db2, compileQuery({ primary: await datasetFor(db2, MSG) }, req))
    expect(result.rows).toEqual([['2025-12-31T03:00:00.000Z', 1]])
  })

  it('supports every date grain, ordered chronologically', async () => {
    const grains = { day: 3, week: 2, month: 2, quarter: 1, year: 1 } as const
    for (const [grain, groups] of Object.entries(grains)) {
      const result = await run(
        request({ sourceId: MSG, dimensions: [{ sourceId: MSG, field: 'enviada_em', dateGrain: grain as keyof typeof grains }], measures: [{ sourceId: MSG, field: 'mensagem' }] }),
      )
      expect(result.rows).toHaveLength(groups)
      const dates = result.rows.map((row) => row[0] as string)
      expect([...dates].sort()).toEqual(dates)
    }
  })
})

describe('compileQuery on snapshots', () => {
  it('computes sum, avg, min, max and count distinct', async () => {
    const measures = (aggregations: readonly ('sum' | 'avg' | 'min' | 'max' | 'count' | 'count_distinct')[]) =>
      aggregations.map((aggregation) => ({ sourceId: salesId, field: 'valor', aggregation }))
    const first = await run(request({ sourceId: salesId, measures: measures(['sum', 'avg', 'min', 'max']) }))
    const second = await run(request({ sourceId: salesId, measures: measures(['count', 'count_distinct']) }))
    expect(first.rows[0]).toEqual([480, 96, 10, 300])
    expect(second.rows[0]).toEqual([5, 5])
    expect(first.columns[0]).toMatchObject({ type: 'currency', label: 'Soma de Valor' })
  })

  it('defaults to sum for numbers and count for text', async () => {
    const result = await run(request({ sourceId: salesId, measures: [{ sourceId: salesId, field: 'valor' }, { sourceId: salesId, field: 'vendedor' }] }))
    expect(result.rows[0]).toEqual([480, 6])
  })

  it('rejects summing a text field', async () => {
    await expect(run(request({ sourceId: salesId, measures: [{ sourceId: salesId, field: 'vendedor', aggregation: 'sum' }] }))).rejects.toMatchObject({ httpStatus: 422 })
  })

  it.each([
    [{ op: 'in', field: 'vendedor', values: ['Ana', 'Bruno'] }, 450],
    [{ op: 'not_in', field: 'vendedor', values: ['Ana'] }, 80],
    [{ op: 'between', field: 'data', values: ['2026-01-01T00:00:00Z', '2026-01-31T23:59:59Z'] }, 400],
    [{ op: 'gte', field: 'valor', values: [50] }, 450],
    [{ op: 'lte', field: 'valor', values: ['20'] }, 30],
    [{ op: 'is_null', field: 'valor', values: [] }, null],
    [{ op: 'not_null', field: 'valor', values: [] }, 480],
  ] as const)('filters with %o', async (filter, expected) => {
    const result = await run(
      request({ sourceId: salesId, measures: [{ sourceId: salesId, field: 'valor' }], filters: [{ sourceId: salesId, ...filter, values: [...filter.values] }] }),
    )
    expect(result.rows[0]).toEqual([expected])
  })

  it('ignores filters from unrelated sources', async () => {
    const result = await run(
      request({ sourceId: salesId, measures: [{ sourceId: salesId, field: 'valor' }], filters: [{ sourceId: MSG, field: 'atendente', op: 'in', values: ['Ana'] }] }),
    )
    expect(result.rows[0]).toEqual([480])
  })

  it('keeps the top N and folds the rest into "Outros" with a correct average', async () => {
    const result = await run(
      request({ sourceId: salesId, dimensions: [{ sourceId: salesId, field: 'vendedor' }], measures: [{ sourceId: salesId, field: 'valor', aggregation: 'avg' }], limit: 2 }),
    )
    // Ana avg 200, Bruno 50; Carla 10 and Diego 20 fold into Outros: avg(10, 20) = 15, not avg(10, 20) of averages by chance.
    expect(result.rows).toEqual([
      ['Ana', 200],
      ['Bruno', 50],
      ['Outros', 15],
    ])
    expect(result.columns[0]!.type).toBe('text')
  })

  it('does not add "Outros" when every value fits', async () => {
    const result = await run(request({ sourceId: salesId, dimensions: [{ sourceId: salesId, field: 'regiao' }], measures: [{ sourceId: salesId, field: 'valor' }] }))
    expect(result.rows.map((row) => row[0])).toEqual(['Sul', 'Norte', 'Leste'])
  })

  it('sorts by category when asked and limits plain queries', async () => {
    const result = await run(
      request({
        sourceId: salesId,
        dimensions: [{ sourceId: salesId, field: 'vendedor' }],
        measures: [{ sourceId: salesId, field: 'valor' }],
        sort: { by: 'category', dir: 'desc' },
        groupOthers: false,
        limit: 2,
      }),
    )
    expect(result.rows).toEqual([
      ['Diego', 20],
      ['Carla', 10],
    ])
  })

  it('returns two dimensions as [d1, d2, m]', async () => {
    const result = await run(
      request({ sourceId: salesId, dimensions: [{ sourceId: salesId, field: 'regiao' }, { sourceId: salesId, field: 'vendedor' }], measures: [{ sourceId: salesId, field: 'valor' }], groupOthers: false }),
    )
    expect(result.rows).toContainEqual(['Sul', 'Ana', 400])
    expect(result.rows[0]).toHaveLength(3)
  })

  it('evaluates calculated fields as row values and as aggregate ratios', async () => {
    const calculatedFields = [
      { id: 'dobro', name: 'Dobro', expression: '[Valor] * 2', sourceId: salesId },
      { id: 'media', name: 'Ticket', expression: 'SUM([Valor]) / COUNT([Vendedor])', sourceId: salesId },
    ]
    const result = await run(
      request({ sourceId: salesId, calculatedFields, measures: [{ sourceId: salesId, field: 'calc:dobro' }, { sourceId: salesId, field: 'calc:media' }] }),
    )
    expect(result.rows[0]).toEqual([960, 80])
    expect(result.columns.map((column) => column.label)).toEqual(['Soma de Dobro', 'Ticket'])
  })

  it('throws UNKNOWN_FIELD for fields that do not exist', async () => {
    await expect(run(request({ sourceId: salesId, measures: [{ sourceId: salesId, field: 'nope' }] }))).rejects.toMatchObject({ code: 'UNKNOWN_FIELD', httpStatus: 422 })
  })

  it('never puts field keys into the SQL text', async () => {
    const hostileKey = `x'); DROP TABLE users; --`
    const hostile = await seedSnapshotSource(db, { name: 'Hostil', fields: [sourceField(hostileKey, 'number')], rows: [{ [hostileKey]: 7 }] })
    const req = request({ sourceId: hostile.id, measures: [{ sourceId: hostile.id, field: hostileKey }] })
    const compiled = compileQuery({ primary: await datasetFor(db, hostile.id) }, req)
    const text = new PgDialect().sqlToQuery(compiled.query).sql
    expect(text).not.toContain('DROP TABLE')
    expect((await runQuery(db, compiled)).rows).toEqual([[7]])
    expect(await executeRows(db, sql`SELECT 1 FROM users LIMIT 1`)).toHaveLength(1)
  })
})

describe('relationships', () => {
  it('filters by a related source through the key and joins related fields', async () => {
    const related: RelatedDataset[] = [{ dataset: await datasetFor(db, 'internal:whatsapp_conversations'), localField: 'telefone', remoteField: 'telefone' }]
    const filtered = await run(
      request({
        sourceId: salesId,
        measures: [{ sourceId: salesId, field: 'valor' }],
        filters: [{ sourceId: 'internal:whatsapp_conversations', field: 'contato', op: 'in', values: ['Maria'] }],
      }),
      related,
    )
    expect(filtered.rows[0]).toEqual([400])

    const joined = await run(
      request({
        sourceId: salesId,
        dimensions: [{ sourceId: 'internal:whatsapp_conversations', field: 'contato' }],
        measures: [{ sourceId: salesId, field: 'valor' }],
        groupOthers: false,
      }),
      related,
    )
    expect(joined.rows).toEqual([
      ['Maria', 400],
      ['João', 50],
      [null, 30],
    ])
    expect(sales.fields).toHaveLength(5)
  })
})
