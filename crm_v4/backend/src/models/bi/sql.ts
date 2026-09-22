import type { SQL } from 'drizzle-orm'
import type { Db } from '../../db/client.js'

/** Raw query rows; postgres-js returns an array and PGlite a `{ rows }` object. */
export async function executeRows<T>(db: Db, query: SQL): Promise<T[]> {
  const result = (await db.execute(query)) as unknown as T[] | { rows: T[] }
  return Array.isArray(result) ? result : result.rows
}
