import { drizzle } from 'drizzle-orm/postgres-js'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import postgres from 'postgres'
import * as schema from './schema.js'

/** Shared by the postgres-js client (runtime) and PGlite (tests). */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>

export function createDb(databaseUrl: string) {
  // prepare: false keeps Supabase's transaction pooler (port 6543) working.
  const client = postgres(databaseUrl, { prepare: false })
  return { db: drizzle(client, { schema }) as Db, close: () => client.end() }
}

/** Runs fn in a transaction; the transaction handle is passed as a Db so model helpers accept it. */
export function inTransaction<T>(db: Db, fn: (tx: Db) => Promise<T>): Promise<T> {
  return db.transaction((tx) => fn(tx as unknown as Db))
}
