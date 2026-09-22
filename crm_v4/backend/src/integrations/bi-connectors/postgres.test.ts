import { describe, expect, it, vi } from 'vitest'
import { INGEST_BATCH_ROWS, MAX_SOURCE_ROWS, QUERY_TIMEOUT_MS } from '../../models/bi/limits.js'
import { readPostgres, type PgClient, type PgConnect } from './postgres.js'
import type { DatabaseConfig } from './sql-guard.js'

type Row = Record<string, unknown>

async function collect<T>(rows: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = []
  for await (const row of rows) out.push(row)
  return out
}

/** A `postgres` client double: records statements; the cursor yields `batches` or throws `error`. */
function fakeClient({ batches = [] as Row[][], error = null as unknown } = {}) {
  const statements: string[] = []
  const cursorSizes: number[] = []
  const client = {
    unsafe: vi.fn((query: string) => {
      statements.push(query)
      return Object.assign(Promise.resolve([]), {
        cursor: (rows: number) => {
          cursorSizes.push(rows)
          return (async function* () {
            if (error) throw error
            yield* batches
          })()
        },
      })
    }),
    end: vi.fn(async () => {}),
  } satisfies PgClient
  const connect = vi.fn<PgConnect>(() => client)
  return { client, connect, statements, cursorSizes }
}

const config: DatabaseConfig = {
  host: 'db.example.com',
  port: 5432,
  database: 'crm',
  user: 'leitor',
  ssl: true,
  mode: 'table',
  table: { schema: 'public', name: 'ven"das' },
}
const secrets = { password: 's3nha' }

describe('readPostgres', () => {
  it('connects with one connection and the given credentials', async () => {
    const fake = fakeClient()

    await collect(readPostgres(config, secrets, { allowPrivate: true, connect: fake.connect }))

    expect(fake.connect).toHaveBeenCalledWith(
      expect.objectContaining({ host: 'db.example.com', port: 5432, database: 'crm', username: 'leitor', password: 's3nha', ssl: 'require', max: 1 }),
    )
  })

  it('opens a read-only transaction with a 30 s timeout before the query', async () => {
    const fake = fakeClient()

    await collect(readPostgres(config, secrets, { allowPrivate: true, connect: fake.connect }))

    expect(fake.statements.slice(0, 2)).toEqual(['BEGIN READ ONLY', `SET LOCAL statement_timeout = ${QUERY_TIMEOUT_MS}`])
  })

  it('builds SELECT * with escaped identifiers in table mode', async () => {
    const fake = fakeClient()

    await collect(readPostgres(config, secrets, { allowPrivate: true, connect: fake.connect }))

    expect(fake.statements[2]).toBe('SELECT * FROM "public"."ven""das"')
  })

  it('runs the checked query in query mode', async () => {
    const fake = fakeClient()

    await collect(readPostgres({ ...config, mode: 'query', query: 'SELECT 1 AS n' }, secrets, { allowPrivate: true, connect: fake.connect }))

    expect(fake.statements[2]).toBe('SELECT 1 AS n')
  })

  it('rejects a writing query without connecting', async () => {
    const fake = fakeClient()

    await expect(
      collect(readPostgres({ ...config, mode: 'query', query: 'DELETE FROM t' }, secrets, { allowPrivate: true, connect: fake.connect })),
    ).rejects.toMatchObject({ code: 'QUERY_NOT_READ_ONLY' })
    expect(fake.connect).not.toHaveBeenCalled()
  })

  it('refuses an internal host without connecting', async () => {
    const fake = fakeClient()

    await expect(
      collect(readPostgres({ ...config, host: '127.0.0.1' }, secrets, { allowPrivate: false, connect: fake.connect })),
    ).rejects.toMatchObject({ code: 'HOST_NOT_ALLOWED' })
    expect(fake.connect).not.toHaveBeenCalled()
  })

  it('yields rows from cursor batches of INGEST_BATCH_ROWS', async () => {
    const fake = fakeClient({ batches: [[{ id: 1 }, { id: 2 }], [{ id: 3 }]] })

    const rows = await collect(readPostgres(config, secrets, { allowPrivate: true, connect: fake.connect }))

    expect(rows).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }])
    expect(fake.cursorSizes).toEqual([INGEST_BATCH_ROWS])
  })

  it('always closes the client', async () => {
    const fake = fakeClient({ error: Object.assign(new Error('boom'), { code: '42P01' }) })

    await collect(readPostgres(config, secrets, { allowPrivate: true, connect: fake.connect })).catch(() => {})

    expect(fake.client.end).toHaveBeenCalledWith({ timeout: 0 })
  })

  it('closes the client when the consumer stops early', async () => {
    const fake = fakeClient({ batches: [[{ id: 1 }, { id: 2 }]] })

    const rows = readPostgres(config, secrets, { allowPrivate: true, connect: fake.connect })
    await rows.next()
    await rows.return(undefined)

    expect(fake.client.end).toHaveBeenCalled()
  })

  it.each([
    ['28P01', 'AUTH_FAILED', 'Usuário ou senha do banco incorretos.'],
    ['ECONNREFUSED', 'CONNECTION_FAILED', 'Não foi possível conectar ao banco. Verifique endereço e porta.'],
    ['ENOTFOUND', 'CONNECTION_FAILED', 'Não foi possível conectar ao banco. Verifique endereço e porta.'],
    ['CONNECT_TIMEOUT', 'CONNECTION_FAILED', 'Não foi possível conectar ao banco. Verifique endereço e porta.'],
    ['57014', 'TIMEOUT', 'A consulta passou de 30 segundos.'],
    ['25006', 'QUERY_NOT_READ_ONLY', 'A consulta precisa ser uma única instrução SELECT, sem alterar dados.'],
  ])('maps driver code %s to %s', async (driverCode, code, message) => {
    const fake = fakeClient({ error: Object.assign(new Error('driver'), { code: driverCode }) })

    await expect(collect(readPostgres(config, secrets, { allowPrivate: true, connect: fake.connect }))).rejects.toMatchObject({
      code,
      message,
      httpStatus: 422,
    })
  })

  it('stops with TOO_MANY_ROWS past the row limit', async () => {
    const batch = Array.from({ length: INGEST_BATCH_ROWS }, (_, id) => ({ id }))
    const batches = Array.from({ length: MAX_SOURCE_ROWS / INGEST_BATCH_ROWS + 1 }, () => batch)
    const fake = fakeClient({ batches })

    await expect(collect(readPostgres(config, secrets, { allowPrivate: true, connect: fake.connect }))).rejects.toMatchObject({
      code: 'TOO_MANY_ROWS',
      message: 'A consulta passa de 500.000 linhas.',
    })
  })
})
