import type { Db } from '../db/client.js'
import { whatsappConnection, type ConnectionRow } from '../db/schema.js'

type Changes = Partial<Pick<ConnectionRow, 'status' | 'lastQr' | 'phoneNumber' | 'lastConnectedAt'>>

/** The single WhatsApp connection (FR-003); created on first access. */
export async function get(db: Db, instanceName: string): Promise<ConnectionRow> {
  const [existing] = await db.select().from(whatsappConnection).limit(1)
  if (existing) return existing
  const [created] = await db
    .insert(whatsappConnection)
    .values({ instanceName })
    .onConflictDoNothing({ target: whatsappConnection.singleton })
    .returning()
  return created ?? (await db.select().from(whatsappConnection).limit(1))[0]!
}

export async function update(db: Db, instanceName: string, changes: Changes): Promise<ConnectionRow> {
  await get(db, instanceName)
  const [row] = await db.update(whatsappConnection).set(changes).returning()
  return row!
}
