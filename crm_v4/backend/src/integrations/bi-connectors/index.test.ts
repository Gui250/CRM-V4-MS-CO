import { Readable } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'
import { createBiConnectors, sourceConfigSchemas, sourceSecretsSchemas } from './index.js'

const readers = vi.hoisted(() => ({
  readPostgres: vi.fn(),
  readMysql: vi.fn(),
  readApi: vi.fn(),
  readGoogleSheet: vi.fn(),
  readXlsx: vi.fn(),
  listSheets: vi.fn(),
}))

vi.mock('./postgres.js', () => ({ readPostgres: readers.readPostgres }))
vi.mock('./mysql.js', () => ({ readMysql: readers.readMysql }))
vi.mock('./http-api.js', () => ({ readApi: readers.readApi }))
vi.mock('./google-sheets.js', () => ({ readGoogleSheet: readers.readGoogleSheet }))
vi.mock('./xlsx.js', () => ({ readXlsx: readers.readXlsx, listSheets: readers.listSheets }))

async function collect<T>(rows: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = []
  for await (const row of rows) out.push(row)
  return out
}

async function* rowsOf(...rows: Record<string, unknown>[]) {
  yield* rows
}

function connectors(files: Record<string, string> = {}) {
  const storage = { get: vi.fn(async (key: string) => (key in files ? Readable.from([Buffer.from(files[key]!)]) : null)) }
  const fetchFake = vi.fn<typeof fetch>()
  return { bi: createBiConnectors({ storage, allowPrivateNetworks: false, fetch: fetchFake }), storage, fetchFake }
}

const db = { host: 'db.example.com', port: 5432, database: 'crm', user: 'u', mode: 'table', table: { name: 't' } }

describe('createBiConnectors.read', () => {
  it('reads a CSV file from storage', async () => {
    const { bi, storage } = connectors({ 'bi/a.csv': 'nome;valor\nAna;1\n' })

    const rows = await collect(bi.read('spreadsheet_file', { storagePath: 'bi/a.csv', originalFilename: 'Vendas.CSV' }, {}))

    expect(rows).toEqual([{ nome: 'Ana', valor: '1' }])
    expect(storage.get).toHaveBeenCalledWith('bi/a.csv')
  })

  it('reads an .xlsx file with the chosen sheet and header row', async () => {
    readers.readXlsx.mockReturnValue(rowsOf({ a: 1 }))
    const { bi } = connectors({ 'bi/b': 'zip' })

    const rows = await collect(
      bi.read('spreadsheet_file', { storagePath: 'bi/b', originalFilename: 'b.xlsx', sheet: 'Vendas', headerRow: 2 }, {}),
    )

    expect(rows).toEqual([{ a: 1 }])
    expect(readers.readXlsx).toHaveBeenCalledWith(expect.any(Readable), expect.objectContaining({ sheet: 'Vendas', headerRow: 2 }))
  })

  it('rejects a missing file with NOT_FOUND', async () => {
    const { bi } = connectors()

    await expect(collect(bi.read('spreadsheet_file', { storagePath: 'x', originalFilename: 'x.csv' }, {}))).rejects.toMatchObject({
      code: 'NOT_FOUND',
      httpStatus: 404,
      message: 'Arquivo da planilha não encontrado.',
    })
  })

  it('rejects an unsupported extension', async () => {
    const { bi } = connectors({ x: '' })

    await expect(collect(bi.read('spreadsheet_file', { storagePath: 'x', originalFilename: 'x.xls' }, {}))).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    })
  })

  it('dispatches spreadsheet_url to the Google Sheets reader with the network guard', async () => {
    readers.readGoogleSheet.mockReturnValue(rowsOf())
    const { bi, fetchFake } = connectors()

    await collect(bi.read('spreadsheet_url', { url: 'https://docs.google.com/spreadsheets/d/abc/edit' }, {}))

    expect(readers.readGoogleSheet).toHaveBeenCalledWith(
      { url: 'https://docs.google.com/spreadsheets/d/abc/edit', headerRow: 1 },
      { allowPrivate: false, fetch: fetchFake },
    )
  })

  it('dispatches postgres with parsed config and secrets', async () => {
    readers.readPostgres.mockReturnValue(rowsOf({ id: 1 }))
    const { bi } = connectors()

    const rows = await collect(bi.read('postgres', db, { password: 'p' }))

    expect(rows).toEqual([{ id: 1 }])
    expect(readers.readPostgres).toHaveBeenCalledWith({ ...db, ssl: false }, { password: 'p' }, expect.objectContaining({ allowPrivate: false }))
  })

  it('dispatches mysql', async () => {
    readers.readMysql.mockReturnValue(rowsOf())
    const { bi } = connectors()

    await collect(bi.read('mysql', { ...db, port: 3306 }, { password: 'p' }))

    expect(readers.readMysql).toHaveBeenCalledWith(expect.objectContaining({ port: 3306 }), { password: 'p' }, expect.anything())
  })

  it('dispatches api with default header and query lists', async () => {
    readers.readApi.mockReturnValue(rowsOf())
    const { bi } = connectors()

    await collect(bi.read('api', { url: 'https://api.example.com', method: 'GET' }, {}))

    expect(readers.readApi).toHaveBeenCalledWith(
      { url: 'https://api.example.com', method: 'GET', headers: [], query: [] },
      { headers: [] },
      expect.anything(),
    )
  })

  it('rejects an invalid config with VALIDATION_ERROR on iteration', async () => {
    const { bi } = connectors()

    await expect(collect(bi.read('postgres', { ...db, port: 0 }, { password: 'p' }))).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      httpStatus: 422,
    })
  })
})

describe('createBiConnectors.listSheets', () => {
  it('lists the sheets of a stored file', async () => {
    readers.listSheets.mockResolvedValue(['A', 'B'])
    const { bi } = connectors({ 'bi/c': 'zip' })

    expect(await bi.listSheets('bi/c')).toEqual(['A', 'B'])
  })

  it('rejects a missing file', async () => {
    const { bi } = connectors()

    await expect(bi.listSheets('nope')).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
})

describe('sourceConfigSchemas', () => {
  it('only accepts https docs.google.com links', () => {
    expect(sourceConfigSchemas.spreadsheet_url.safeParse({ url: 'https://evil.com/spreadsheets/d/x' }).success).toBe(false)
    expect(sourceConfigSchemas.spreadsheet_url.safeParse({ url: 'http://docs.google.com/spreadsheets/d/x' }).success).toBe(false)
  })

  it('requires the table in table mode and the query in query mode', () => {
    expect(sourceConfigSchemas.postgres.safeParse({ ...db, table: undefined }).success).toBe(false)
    expect(sourceConfigSchemas.postgres.safeParse({ ...db, mode: 'query' }).success).toBe(false)
  })

  it('caps the query at 10.000 characters', () => {
    const query = 'x'.repeat(10_001)

    expect(sourceConfigSchemas.mysql.safeParse({ ...db, mode: 'query', query }).success).toBe(false)
  })

  it('caps pagination at 50 pages', () => {
    const api = { url: 'https://a.com', method: 'GET', pagination: { param: 'p', start: 1, maxPages: 51 } }

    expect(sourceConfigSchemas.api.safeParse(api).success).toBe(false)
  })

  it('rejects a header name that HTTP cannot carry', () => {
    expect(sourceSecretsSchemas.api.safeParse({ headers: [{ name: 'Bad Header', value: 'x' }] }).success).toBe(false)
  })

  it('defaults headerRow to 1', () => {
    expect(sourceConfigSchemas.spreadsheet_file.parse({ storagePath: 'a', originalFilename: 'a.csv' }).headerRow).toBe(1)
  })
})
