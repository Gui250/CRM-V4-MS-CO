import { PGlite } from '@electric-sql/pglite'
import { citext } from '@electric-sql/pglite/contrib/citext'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { fileURLToPath } from 'node:url'
import type { Db } from '../db/client.js'
import * as schema from '../db/schema.js'

const migrationsFolder = fileURLToPath(new URL('../db/migrations', import.meta.url))

let template: Promise<PGlite> | undefined

/** Migrated once per worker; each test clones it instead of re-running migrations. */
function migratedTemplate(): Promise<PGlite> {
  template ??= (async () => {
    const client = new PGlite({ extensions: { citext } })
    await migrate(drizzle(client), { migrationsFolder })
    return client
  })()
  return template
}

/** Fresh in-memory Postgres with the real migrations applied. No network, no server. */
export async function createTestDb(): Promise<Db> {
  const client = (await (await migratedTemplate()).clone()) as PGlite
  return drizzle(client, { schema }) as unknown as Db
}

let phoneSeq = 0

/** Contact (+ optional conversation) and a lead in the given stage, inserted directly. */
export async function insertLead(
  db: Db,
  input: { pipelineId: string; stageId: string; position?: number; name?: string; valueCents?: number; withConversation?: boolean },
) {
  phoneSeq += 1
  const phone = `55219${String(phoneSeq).padStart(8, '0')}`
  const [contact] = await db
    .insert(schema.contacts)
    .values({ waJid: `${phone}@s.whatsapp.net`, phone, name: input.name ?? `Lead ${phoneSeq}` })
    .returning()
  if (input.withConversation) await db.insert(schema.conversations).values({ contactId: contact!.id })
  const [lead] = await db
    .insert(schema.leads)
    .values({
      pipelineId: input.pipelineId,
      stageId: input.stageId,
      contactId: contact!.id,
      position: input.position ?? 0,
      valueCents: input.valueCents ?? null,
    })
    .returning()
  return { lead: lead!, contact: contact! }
}
