import { sql } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as datasetModel from '../models/bi/dataset.js'
import { queryRequestSchema } from '../models/bi/definition.js'
import * as compiler from '../models/bi/query-compiler.js'
import * as relationshipModel from '../models/bi/relationship.js'
import type { User } from '../models/user.js'
import { fakeContext } from '../test/context.js'
import * as controller from './bi-query.js'

vi.mock('../models/bi/dataset.js')
vi.mock('../models/bi/relationship.js')
vi.mock('../models/bi/query-compiler.js', async (importOriginal) => ({
  ...(await importOriginal<typeof compiler>()),
  runQuery: vi.fn(),
}))

const user = { id: 'u', role: 'attendant' } as User
const { ctx } = fakeContext()
const SRC = '11111111-1111-1111-1111-111111111111'

const dataset = (overrides: Partial<datasetModel.Dataset> = {}): datasetModel.Dataset => ({
  sourceId: SRC,
  name: 'Vendas',
  fields: [
    { key: 'vendedor', label: 'Vendedor', type: 'text', detectedType: 'text', invalidCount: 0, expr: sql`1` },
    { key: 'valor', label: 'Valor', type: 'number', detectedType: 'number', invalidCount: 3, expr: sql`1` },
  ],
  from: sql`FROM x`,
  dataAsOf: new Date('2026-03-01T12:00:00Z'),
  lastError: null,
  lastAttemptAt: null,
  ...overrides,
})

const request = (input: object) => queryRequestSchema.parse({ sourceId: SRC, ...input })

beforeEach(() => {
  vi.mocked(datasetModel.datasetFor).mockResolvedValue(dataset())
  vi.mocked(relationshipModel.linksOf).mockResolvedValue([])
  vi.mocked(compiler.runQuery).mockResolvedValue({ columns: [], rows: [[1]] })
})

describe('bi-query controller', () => {
  it('returns rows with the capture date and ignored rows of the fields used', async () => {
    const result = await controller.runVisualQuery(ctx, user, request({ measures: [{ sourceId: SRC, field: 'valor' }] }))
    expect(result).toMatchObject({ rows: [[1]], dataAsOf: '2026-03-01T12:00:00.000Z', ignoredRows: 3, staleWarning: null, missingFields: [] })
  })

  it('warns when the last refresh failed', async () => {
    vi.mocked(datasetModel.datasetFor).mockResolvedValue(dataset({ lastError: 'fora do ar' }))
    const result = await controller.runVisualQuery(ctx, user, request({ measures: [{ sourceId: SRC, field: 'valor' }] }))
    expect(result.staleWarning).toBe('Dados de 01/03/2026 09:00; a última atualização falhou.')
  })

  it('drops fields that no longer exist and lists them instead of failing', async () => {
    const result = await controller.runVisualQuery(
      ctx,
      user,
      request({ dimensions: [{ sourceId: SRC, field: 'sumiu' }], measures: [{ sourceId: SRC, field: 'valor' }], filters: [{ sourceId: SRC, field: 'outro', op: 'is_null' }] }),
    )
    expect(result.missingFields).toEqual(['sumiu', 'outro'])
    const compiled = vi.mocked(compiler.runQuery).mock.calls[0]![1]
    expect(compiled.columns.map((column) => column.label)).toEqual(['Soma de Valor'])
  })

  it('answers empty without querying when nothing is left to ask', async () => {
    const result = await controller.runVisualQuery(ctx, user, request({ measures: [{ sourceId: SRC, field: 'sumiu' }] }))
    expect(result.rows).toEqual([])
    expect(compiler.runQuery).not.toHaveBeenCalled()
  })

  it('maps a Postgres statement timeout to QUERY_TIMEOUT', async () => {
    vi.mocked(compiler.runQuery).mockRejectedValue(Object.assign(new Error('canceled'), { code: '57014' }))
    await expect(controller.runVisualQuery(ctx, user, request({ measures: [{ sourceId: SRC, field: 'valor' }] }))).rejects.toMatchObject({
      code: 'QUERY_TIMEOUT',
      httpStatus: 504,
    })
  })

  it('loads related datasets and skips links whose source is gone', async () => {
    const other = dataset({ sourceId: 'internal:whatsapp_conversations' })
    vi.mocked(relationshipModel.linksOf).mockResolvedValue([
      { otherSourceId: 'internal:whatsapp_conversations', localField: 'vendedor', remoteField: 'vendedor' },
      { otherSourceId: 'gone', localField: 'vendedor', remoteField: 'x' },
    ])
    vi.mocked(datasetModel.datasetFor).mockImplementation(async (_db, id) => {
      if (id === 'gone') throw new Error('not found')
      return id === SRC ? dataset() : other
    })
    expect(await controller.relatedDatasets(ctx, SRC)).toEqual([{ dataset: other, localField: 'vendedor', remoteField: 'vendedor' }])
  })

  it('suggests a page using distinct counts of text fields', async () => {
    vi.mocked(compiler.runQuery).mockResolvedValue({ columns: [], rows: [[12]] })
    const page = await controller.suggestReportPage(ctx, user, SRC)
    expect(page.visuals.map((visual) => visual.type)).toEqual(['kpi', 'bar'])
  })
})
