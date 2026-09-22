import postgres from 'postgres'
import { INGEST_BATCH_ROWS, QUERY_TIMEOUT_MS } from '../../models/bi/limits.js'
import { assertHostAllowed, type GuardOptions } from './network-guard.js'
import { countRow } from './rows.js'
import { mapDatabaseError, sourceQuery, type DatabaseConfig } from './sql-guard.js'

type Row = Record<string, unknown>

/** The slice of a `postgres` client this connector uses, so tests can pass a fake. */
export interface PgClient {
  unsafe(query: string): PromiseLike<unknown> & { cursor(rows: number): AsyncIterable<Row[]> }
  end(options: { timeout: number }): Promise<void>
}

export type PgConnect = (options: postgres.Options<Record<string, postgres.PostgresType>>) => PgClient

const PG_CODES = {
  '28P01': 'auth',
  '28000': 'auth',
  '57014': 'timeout',
  '25006': 'readOnly',
  CONNECT_TIMEOUT: 'connection',
  CONNECTION_CLOSED: 'connection',
  CONNECTION_DESTROYED: 'connection',
} as const

// postgres.js does not export its identifier escaping; this is the same double-quote rule.
export const quoteIdentifier = (name: string) => `"${name.replace(/"/g, '""')}"`

const defaultConnect: PgConnect = (options) => postgres(options) as unknown as PgClient

export async function* readPostgres(
  config: DatabaseConfig,
  secrets: { password: string },
  opts: GuardOptions & { connect?: PgConnect },
): AsyncGenerator<Row> {
  await assertHostAllowed(config.host, opts)
  const query = sourceQuery(config, quoteIdentifier)
  const sql = (opts.connect ?? defaultConnect)({
    host: config.host,
    port: config.port,
    database: config.database,
    username: config.user,
    password: secrets.password,
    // Encrypted without CA verification (libpq sslmode=require): managed databases often use
    // their own CA, which the backend does not have.
    ssl: config.ssl ? 'require' : false,
    max: 1,
    connect_timeout: QUERY_TIMEOUT_MS / 1000,
    onnotice: () => {},
  })
  try {
    // max: 1 keeps every statement on one connection, so a plain BEGIN is safe. sql.begin() takes
    // a callback, and an async generator cannot yield from inside one.
    await sql.unsafe('BEGIN READ ONLY')
    await sql.unsafe(`SET LOCAL statement_timeout = ${QUERY_TIMEOUT_MS}`)
    let count = 0
    for await (const batch of sql.unsafe(query).cursor(INGEST_BATCH_ROWS)) {
      for (const row of batch) {
        count = countRow(count, 'A consulta')
        yield row
      }
    }
  } catch (error) {
    throw mapDatabaseError(error, PG_CODES)
  } finally {
    await sql.end({ timeout: 0 }) // closing the connection also rolls the read-only transaction back
  }
}
