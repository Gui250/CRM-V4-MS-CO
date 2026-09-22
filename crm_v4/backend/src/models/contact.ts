import { eq, getTableColumns, sql } from 'drizzle-orm'
import type { Db } from '../db/client.js'
import { contacts, type ContactRow } from '../db/schema.js'

export const phoneFromJid = (jid: string) => jid.split('@')[0]!.split(':')[0]!.replace(/\D/g, '')

export async function upsertByJid(
  db: Db,
  input: { waJid: string; name: string | null },
): Promise<{ contact: ContactRow; created: boolean }> {
  if (input.waJid.endsWith('@g.us')) throw new Error(`Group JIDs are not contacts: ${input.waJid}`)
  const name = input.name?.trim() || null
  const [row] = await db
    .insert(contacts)
    .values({ waJid: input.waJid, phone: phoneFromJid(input.waJid), name })
    .onConflictDoUpdate({
      target: contacts.waJid,
      set: { name: sql`coalesce(excluded.name, ${contacts.name})` },
    })
    // xmax = 0 only for freshly inserted rows.
    .returning({ ...getTableColumns(contacts), created: sql<boolean>`(xmax = 0)` })
  const { created, ...contact } = row!
  return { contact: contact as ContactRow, created }
}

export async function setAvatar(db: Db, id: string, avatarUrl: string | null): Promise<void> {
  await db.update(contacts).set({ avatarUrl }).where(eq(contacts.id, id))
}

export async function findById(db: Db, id: string): Promise<ContactRow | null> {
  const [row] = await db.select().from(contacts).where(eq(contacts.id, id))
  return row ?? null
}

/** "Não automatizar" (FR-028). `byUserId` null = the contact asked for it. */
export async function setOptOut(db: Db, id: string, byUserId: string | null): Promise<void> {
  await db.update(contacts).set({ automationOptOutAt: new Date(), automationOptOutByUserId: byUserId }).where(eq(contacts.id, id))
}

export async function clearOptOut(db: Db, id: string): Promise<void> {
  await db.update(contacts).set({ automationOptOutAt: null, automationOptOutByUserId: null }).where(eq(contacts.id, id))
}
