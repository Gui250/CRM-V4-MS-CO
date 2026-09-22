import { eq } from 'drizzle-orm'
import type { Db } from '../db/client.js'
import { contacts, conversations, messages, users } from '../db/schema.js'
import { biSnapshotRows, biSnapshots, biSources } from '../db/schema-bi.js'
import type { FieldType, SourceField } from '../models/bi/definition.js'

export async function seedUser(db: Db, name: string, role: 'admin' | 'attendant' = 'attendant') {
  const [user] = await db
    .insert(users)
    .values({ name, email: `${name.toLowerCase()}@v4.test`, passwordHash: 'x', role, status: 'active' })
    .returning()
  return user!
}

type SeedMessage = { direction: 'inbound' | 'outbound'; sentAt: string; by?: string }

/** Two contacts, a handful of messages sent by Ana and Bruno. Returns the users by name. */
export async function seedChat(db: Db, messageList?: { contact: string; messages: SeedMessage[] }[]) {
  const ana = await seedUser(db, 'Ana')
  const bruno = await seedUser(db, 'Bruno')
  const byName: Record<string, string> = { Ana: ana.id, Bruno: bruno.id }
  const data = messageList ?? [
    {
      contact: 'Maria',
      messages: [
        { direction: 'inbound', sentAt: '2026-01-05T12:00:00Z' },
        { direction: 'outbound', sentAt: '2026-01-05T12:05:00Z', by: 'Ana' },
        { direction: 'outbound', sentAt: '2026-02-10T12:00:00Z', by: 'Ana' },
      ],
    },
    {
      contact: 'João',
      messages: [
        { direction: 'inbound', sentAt: '2026-01-06T12:00:00Z' },
        { direction: 'outbound', sentAt: '2026-01-06T12:10:00Z', by: 'Bruno' },
      ],
    },
  ]
  for (const [index, entry] of data.entries()) {
    const phone = `5511900000${index}`
    const [contact] = await db.insert(contacts).values({ waJid: `${phone}@s.whatsapp.net`, phone, name: entry.contact }).returning()
    const [conversation] = await db.insert(conversations).values({ contactId: contact!.id }).returning()
    for (const message of entry.messages as SeedMessage[]) {
      await db.insert(messages).values({
        conversationId: conversation!.id,
        direction: message.direction,
        type: 'text',
        body: 'oi',
        status: message.direction === 'outbound' ? 'sent' : null,
        sentByUserId: message.by ? byName[message.by] : null,
        sentAt: new Date(message.sentAt),
      })
    }
  }
  return { ana, bruno }
}

export const sourceField = (key: string, type: FieldType, invalidCount = 0): SourceField => ({
  key,
  label: key.charAt(0).toUpperCase() + key.slice(1),
  type,
  detectedType: type,
  invalidCount,
})

/** External source with a finished snapshot; rows must already be normalized. */
export async function seedSnapshotSource(
  db: Db,
  input: { name: string; fields: SourceField[]; rows: Record<string, unknown>[]; lastError?: string },
) {
  const [source] = await db
    .insert(biSources)
    .values({ name: input.name, kind: 'spreadsheet_file', config: {}, fields: input.fields, lastError: input.lastError ?? null })
    .returning()
  const [snapshot] = await db
    .insert(biSnapshots)
    .values({ sourceId: source!.id, status: 'succeeded', rowCount: input.rows.length, finishedAt: new Date('2026-03-01T12:00:00Z') })
    .returning()
  if (input.rows.length > 0) {
    await db.insert(biSnapshotRows).values(input.rows.map((data, rowNum) => ({ snapshotId: snapshot!.id, rowNum, data })))
  }
  await db.update(biSources).set({ currentSnapshotId: snapshot!.id }).where(eq(biSources.id, source!.id))
  return { ...source!, currentSnapshotId: snapshot!.id }
}
