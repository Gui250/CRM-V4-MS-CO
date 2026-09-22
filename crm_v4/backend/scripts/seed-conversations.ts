// Dev-only: fills the local database with 5,000 conversations to check SC-004 (list < 2 s).
import { count } from 'drizzle-orm'
import { loadConfig } from '../src/config.js'
import { createDb } from '../src/db/client.js'
import { contacts, conversations, messages } from '../src/db/schema.js'

const TOTAL = 5000
const BATCH = 500

const config = loadConfig()
if (!/localhost|127\.0\.0\.1/.test(config.DATABASE_URL)) {
  throw new Error('Recusado: o seed de desempenho só roda contra um banco local.')
}
const { db, close } = createDb(config.DATABASE_URL)

for (let start = 0; start < TOTAL; start += BATCH) {
  const rows = Array.from({ length: BATCH }, (_, i) => {
    const n = start + i
    return { waJid: `55119${String(n).padStart(8, '0')}@s.whatsapp.net`, phone: `55119${String(n).padStart(8, '0')}`, name: `Lead ${n + 1}` }
  })
  const created = await db.insert(contacts).values(rows).onConflictDoNothing().returning({ id: contacts.id })
  if (created.length === 0) continue
  const convs = await db
    .insert(conversations)
    .values(created.map((c, i) => ({ contactId: c.id, lastMessageAt: new Date(Date.now() - (start + i) * 60_000), lastMessagePreview: 'Olá, tenho interesse', unreadCount: i % 3 })))
    .returning({ id: conversations.id, at: conversations.lastMessageAt })
  await db.insert(messages).values(convs.map((c) => ({ conversationId: c.id, direction: 'inbound' as const, type: 'text' as const, body: 'Olá, tenho interesse', sentAt: c.at! })))
  process.stdout.write(`${Math.min(start + BATCH, TOTAL)}/${TOTAL}\n`)
}

const [row] = await db.select({ value: count() }).from(conversations)
process.stdout.write(`Conversas no banco: ${row?.value}\n`)
await close()
