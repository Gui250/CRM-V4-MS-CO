import type { Connection as CallbackConnection } from 'mysql2'
import mysql from 'mysql2/promise'
import { QUERY_TIMEOUT_MS } from '../../models/bi/limits.js'
import { assertHostAllowed, type GuardOptions } from './network-guard.js'
import { countRow } from './rows.js'
import { mapDatabaseError, sourceQuery, type DatabaseConfig } from './sql-guard.js'

type Row = Record<string, unknown>

const MYSQL_CODES = {
  ER_ACCESS_DENIED_ERROR: 'auth',
  ER_DBACCESS_DENIED_ERROR: 'auth',
  ER_QUERY_TIMEOUT: 'timeout',
  ER_CANT_EXECUTE_IN_READ_ONLY_TRANSACTION: 'readOnly',
  PROTOCOL_CONNECTION_LOST: 'connection',
} as const

// forbidQualified: a table named "a.b" stays one identifier instead of becoming `a`.`b`.
const quoteIdentifier = (name: string) => mysql.escapeId(name, true)

// The promise wrapper keeps the callback connection, the only one with streaming queries; its
// typings leave the property out.
const callbackConnection = (connection: mysql.Connection) =>
  (connection as unknown as { connection: CallbackConnection }).connection

export async function* readMysql(
  config: DatabaseConfig,
  secrets: { password: string },
  opts: GuardOptions,
): AsyncGenerator<Row> {
  await assertHostAllowed(config.host, opts)
  const query = sourceQuery(config, quoteIdentifier)
  let connection: mysql.Connection | undefined
  try {
    connection = await mysql.createConnection({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      password: secrets.password,
      // Encrypted without CA verification, same as the Postgres connector.
      ssl: config.ssl ? { rejectUnauthorized: false } : undefined,
      multipleStatements: false,
      connectTimeout: QUERY_TIMEOUT_MS,
    })
    await connection.query(`SET SESSION max_execution_time = ${QUERY_TIMEOUT_MS}`)
    await connection.query('START TRANSACTION READ ONLY')
    let count = 0
    for await (const row of callbackConnection(connection).query(query).stream()) {
      count = countRow(count, 'A consulta')
      yield row as Row
    }
  } catch (error) {
    throw mapDatabaseError(error, MYSQL_CODES)
  } finally {
    connection?.destroy() // not end(): that would wait for an abandoned stream to finish
  }
}
