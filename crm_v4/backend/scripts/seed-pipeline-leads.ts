// Dev-only: puts up to 2,000 existing contacts as leads in the entry pipeline to check SC-003
// (board < 2 s). Run db:seed:perf first if there are not enough contacts.
import { count, eq } from 'drizzle-orm'
import { loadConfig } from '../src/config.js'
import { createDb } from '../src/db/client.js'
import { contacts, leads, leadStageChanges, users } from '../src/db/schema.js'
import { POSITION_GAP } from '../src/models/lead.js'
import * as pipelineModel from '../src/models/pipeline.js'

const TOTAL = 2000
const BATCH = 500

const config = loadConfig()
if (!/localhost|127\.0\.0\.1/.test(config.DATABASE_URL)) {
  throw new Error('Recusado: o seed de desempenho só roda contra um banco local.')
}
const { db, close } = createDb(config.DATABASE_URL)

const pipeline = await pipelineModel.findEntry(db)
if (!pipeline) throw new Error('Nenhum funil de entrada ativo.')
const assignees = await db.select({ id: users.id }).from(users).where(eq(users.status, 'active'))
const people = await db.select({ id: contacts.id }).from(contacts).limit(TOTAL)

for (let start = 0; start < people.length; start += BATCH) {
  const rows = people.slice(start, start + BATCH).map((contact, i) => {
    const n = start + i
    const stage = pipeline.stages[n % pipeline.stages.length]!
    return {
      pipelineId: pipeline.id,
      stageId: stage.id,
      contactId: contact.id,
      position: Math.floor(n / pipeline.stages.length) * POSITION_GAP,
      valueCents: n % 4 === 0 ? null : ((n * 7919) % 50_000) * 100,
      assigneeId: assignees.length > 0 && n % 3 !== 0 ? assignees[n % assignees.length]!.id : null,
      lostReason: stage.kind === 'lost' ? 'Sem orçamento' : null,
    }
  })
  const created = await db
    .insert(leads)
    .values(rows)
    .onConflictDoNothing({ target: [leads.pipelineId, leads.contactId] })
    .returning({ id: leads.id, stageId: leads.stageId })
  if (created.length > 0) {
    const names = new Map(pipeline.stages.map((stage) => [stage.id, stage.name]))
    await db
      .insert(leadStageChanges)
      .values(created.map((lead) => ({ leadId: lead.id, toStageId: lead.stageId, toStageName: names.get(lead.stageId) ?? null })))
  }
  process.stdout.write(`${Math.min(start + BATCH, people.length)}/${people.length}\n`)
}

const [row] = await db.select({ value: count() }).from(leads).where(eq(leads.pipelineId, pipeline.id))
process.stdout.write(`Leads no funil "${pipeline.name}": ${row?.value}\n`)
await close()
