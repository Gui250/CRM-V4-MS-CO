import { Readable } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'
import { MAX_SOURCE_ROWS, QUERY_TIMEOUT_MS } from '../../models/bi/limits.js'
import type { DatabaseConfig } from './sql-guard.js'

const driver = vi.hoisted(() => ({ createConnection: vi.fn() }))

vi.mock('mysql2/promise', async (importOriginal) => {
  const actual = await importOriginal<{ default: object }>()
  return { default: { ...actual.default, createConnection: driver.createConnection } }
})

const { readMysql } = await import('./mysql.js')

type Row = Record<string, unknown>

async function collect<T>(rows: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = []
  for await (const row of rows) out.push(row)
  return out
}

/** A promise connection double whose `.connection.query(sql).stream()` yields `rows`. */
function fakeConnection({ rows = [] as Row[], streamError = null as unknown } = {}) {
  const connection = {
    query: vi.fn(async () => [[], []]),
    destroy: vi.fn(),
    connection: {
      query: vi.fn(() => ({
        stream: () =>
          streamError
            ? new Readable({ objectMode: true, read() { this.destroy(streamError as Error) } })
            : Readable.from(rows),
      })),
    },
  }
  driver.createConnection.mockResolvedValue(connection)
  return connection
}

const config: DatabaseConfig = {
  host: 'db.example.com',
  port: 3306,
  database: 'crm',
  user: 'leitor',
  ssl: false,
  mode: 'table',
  table: { name: 'ven`das' },
}
const secrets = { password: 's3nha' }
const opts = { allowPrivate: true }

describe('readMysql', () => {
  it('connects without multiple statements', async () => {
    fakeConnection()

    await collect(readMysql(config, secrets, opts))

    expect(driver.createConnection).toHaveBeenCalledWith(
      expect.objectContaining({ host: 'db.example.com', port: 3306, user: 'leitor', password: 's3nha', database: 'crm', multipleStatements: false }),
    )
  })

  it('sets the 30 s timeout and opens a read-only transaction', async () => {
    const connection = fakeConnection()

    await collect(readMysql(config, secrets, opts))

    expect(connection.query.mock.calls.map((call: unknown[]) => call[0])).toEqual([
      `SET SESSION max_execution_time = ${QUERY_TIMEOUT_MS}`,
      'START TRANSACTION READ ONLY',
    ])
  })

  it('builds SELECT * with an escaped identifier in table mode', async () => {
    const connection = fakeConnection()

    await collect(readMysql(config, secrets, opts))

    expect(connection.connection.query).toHaveBeenCalledWith('SELECT * FROM `ven``das`')
  })

  it('keeps a dotted table name as one identifier', async () => {
    const connection = fakeConnection()

    await collect(readMysql({ ...config, table: { schema: 'crm', name: 'a.b' } }, secrets, opts))

    expect(connection.connection.query).toHaveBeenCalledWith('SELECT * FROM `crm`.`a.b`')
  })

  it('streams the rows', async () => {
    fakeConnection({ rows: [{ id: 1 }, { id: 2 }] })

    expect(await collect(readMysql(config, secrets, opts))).toEqual([{ id: 1 }, { id: 2 }])
  })

  it('refuses an internal host without connecting', async () => {
    driver.createConnection.mockClear()

    await expect(collect(readMysql({ ...config, host: '10.0.0.1' }, secrets, { allowPrivate: false }))).rejects.toMatchObject({
      code: 'HOST_NOT_ALLOWED',
    })
    expect(driver.createConnection).not.toHaveBeenCalled()
  })

  it('always destroys the connection', async () => {
    const connection = fakeConnection({ streamError: Object.assign(new Error('x'), { code: 'ER_QUERY_TIMEOUT' }) })

    await collect(readMysql(config, secrets, opts)).catch(() => {})

    expect(connection.destroy).toHaveBeenCalled()
  })

  it.each([
    ['ER_ACCESS_DENIED_ERROR', 'AUTH_FAILED', 'Usuário ou senha do banco incorretos.'],
    ['ECONNREFUSED', 'CONNECTION_FAILED', 'Não foi possível conectar ao banco. Verifique endereço e porta.'],
    ['ETIMEDOUT', 'CONNECTION_FAILED', 'Não foi possível conectar ao banco. Verifique endereço e porta.'],
  ])('maps connection error %s to %s', async (driverCode, code, message) => {
    driver.createConnection.mockImplementation(async () => {
      throw Object.assign(new Error('driver'), { code: driverCode })
    })

    await expect(collect(readMysql(config, secrets, opts))).rejects.toMatchObject({ code, message, httpStatus: 422 })
  })

  it.each([
    ['ER_QUERY_TIMEOUT', 'TIMEOUT', 'A consulta passou de 30 segundos.'],
    ['ER_CANT_EXECUTE_IN_READ_ONLY_TRANSACTION', 'QUERY_NOT_READ_ONLY', 'A consulta precisa ser uma única instrução SELECT, sem alterar dados.'],
  ])('maps query error %s to %s', async (driverCode, code, message) => {
    fakeConnection({ streamError: Object.assign(new Error('driver'), { code: driverCode }) })

    await expect(collect(readMysql(config, secrets, opts))).rejects.toMatchObject({ code, message })
  })

  it('stops with TOO_MANY_ROWS past the row limit', async () => {
    fakeConnection({ rows: Array.from({ length: MAX_SOURCE_ROWS + 1 }, (_, id) => ({ id })) })

    await expect(collect(readMysql(config, secrets, opts))).rejects.toMatchObject({ code: 'TOO_MANY_ROWS' })
  })
})
