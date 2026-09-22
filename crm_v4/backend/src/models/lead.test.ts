import { asc, eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Db } from '../db/client.js'
import { contacts, conversations, leads, leadStageChanges, pipelines, pipelineStages, type StageRow } from '../db/schema.js'
import { createTestDb } from '../test/db.js'
import * as leadModel from './lead.js'
import * as pipelineModel from './pipeline.js'
import * as userModel from './user.js'

let db: Db
let pipelineId: string
let stages: StageRow[]
let phoneSeq = 0

const stageNamed = (name: string) => stages.find((stage) => stage.name === name)!

async function addLead(stageName: string, input: { position: number; name?: string; valueCents?: number; assigneeId?: string; title?: string }) {
  phoneSeq += 1
  const phone = `55119${String(phoneSeq).padStart(8, '0')}`
  const [contact] = await db
    .insert(contacts)
    .values({ waJid: `${phone}@s.whatsapp.net`, phone, name: input.name ?? `Cliente ${phoneSeq}` })
    .returning()
  const [lead] = await db
    .insert(leads)
    .values({
      pipelineId,
      stageId: stageNamed(stageName).id,
      contactId: contact!.id,
      position: input.position,
      valueCents: input.valueCents ?? null,
      assigneeId: input.assigneeId ?? null,
      title: input.title ?? null,
    })
    .returning()
  return lead!
}

async function columnOrder(stageName: string) {
  const rows = await db
    .select({ id: leads.id })
    .from(leads)
    .where(eq(leads.stageId, stageNamed(stageName).id))
    .orderBy(asc(leads.position), asc(leads.id))
  return rows.map((row) => row.id)
}

beforeEach(async () => {
  db = await createTestDb()
  const vendas = await pipelineModel.findEntry(db)
  pipelineId = vendas!.id
  stages = vendas!.stages
})

describe('lead model: board reads', () => {
  it('summarizes every stage over all matching leads, including empty stages', async () => {
    await addLead('Novo', { position: 0, valueCents: 1000 })
    await addLead('Novo', { position: 1024, valueCents: 2500 })
    await addLead('Proposta', { position: 0 })

    const summaries = await leadModel.stageSummaries(db, pipelineId, {})
    expect(summaries.get(stageNamed('Novo').id)).toEqual({ leadCount: 2, valueTotalCents: 3500 })
    expect(summaries.get(stageNamed('Proposta').id)).toEqual({ leadCount: 1, valueTotalCents: 0 })
    expect(summaries.get(stageNamed('Ganho').id)).toEqual({ leadCount: 0, valueTotalCents: 0 })
  })

  it('pages a stage by position with a keyset cursor', async () => {
    const third = await addLead('Novo', { position: 2048 })
    const first = await addLead('Novo', { position: 0 })
    const second = await addLead('Novo', { position: 1024 })

    const page1 = await leadModel.listByStage(db, stageNamed('Novo').id, { limit: 2, filter: {} })
    expect(page1.items.map((lead) => lead.id)).toEqual([first.id, second.id])
    expect(page1.nextCursor).not.toBeNull()

    const page2 = await leadModel.listByStage(db, stageNamed('Novo').id, { limit: 2, cursor: page1.nextCursor!, filter: {} })
    expect(page2.items.map((lead) => lead.id)).toEqual([third.id])
    expect(page2.nextCursor).toBeNull()
  })

  it('returns contact, conversation, unread count and assignee with each lead', async () => {
    const bia = await userModel.create(db, { name: 'Bia', email: 'b@x.com', passwordHash: 'h', role: 'attendant', status: 'active' })
    const lead = await addLead('Novo', { position: 0, name: 'Carla', assigneeId: bia.id })
    const [conversation] = await db.insert(conversations).values({ contactId: lead.contactId, unreadCount: 3 }).returning()

    const [row] = (await leadModel.listByStage(db, stageNamed('Novo').id, { limit: 10, filter: {} })).items
    expect(row).toMatchObject({
      contact: { name: 'Carla' },
      conversationId: conversation!.id,
      unreadCount: 3,
      assignee: { id: bia.id, name: 'Bia' },
    })
    expect(await leadModel.findById(db, lead.id)).toMatchObject({ id: lead.id, assignee: { name: 'Bia' } })
  })

  it('filters by assignee ("none" = unassigned) and searches name, phone or title', async () => {
    const bia = await userModel.create(db, { name: 'Bia', email: 'b@x.com', passwordHash: 'h', role: 'attendant', status: 'active' })
    const carla = await addLead('Novo', { position: 0, name: 'Carla Mendes', assigneeId: bia.id, valueCents: 700 })
    const rafael = await addLead('Novo', { position: 1024, name: 'Rafael Costa', title: 'Plano anual' })

    const ids = async (filter: leadModel.LeadFilter) =>
      (await leadModel.listByStage(db, stageNamed('Novo').id, { limit: 10, filter })).items.map((lead) => lead.id)

    expect(await ids({ assigneeId: bia.id })).toEqual([carla.id])
    expect(await ids({ assigneeId: 'none' })).toEqual([rafael.id])
    expect(await ids({ search: 'carla' })).toEqual([carla.id])
    expect(await ids({ search: 'anual' })).toEqual([rafael.id])
    expect(await ids({ search: 'rafael', assigneeId: bia.id })).toEqual([])

    const [contact] = await db.select().from(contacts).where(eq(contacts.id, carla.contactId))
    expect(await ids({ search: contact!.phone.slice(-6) })).toEqual([carla.id])
    expect((await leadModel.stageSummaries(db, pipelineId, { assigneeId: bia.id })).get(stageNamed('Novo').id)).toEqual({
      leadCount: 1,
      valueTotalCents: 700,
    })
  })
})

describe('lead model: move', () => {
  it('places the card between two neighbors, at the top, at the end, or alone', async () => {
    const a = await addLead('Novo', { position: 0 })
    const b = await addLead('Novo', { position: 1024 })
    const moving = await addLead('Em contato', { position: 0 })

    const between = await leadModel.move(db, { leadId: moving.id, stageId: stageNamed('Novo').id, beforeLeadId: b.id, userId: null })
    expect(between.position).toBe(512)
    expect(await columnOrder('Novo')).toEqual([a.id, moving.id, b.id])

    const top = await leadModel.move(db, { leadId: moving.id, stageId: stageNamed('Novo').id, beforeLeadId: a.id, userId: null })
    expect(top.position).toBe(-leadModel.POSITION_GAP)

    const end = await leadModel.move(db, { leadId: moving.id, stageId: stageNamed('Novo').id, beforeLeadId: null, userId: null })
    expect(end.position).toBe(1024 + leadModel.POSITION_GAP)

    const alone = await leadModel.move(db, { leadId: moving.id, stageId: stageNamed('Proposta').id, beforeLeadId: null, userId: null })
    expect(alone.position).toBe(0)
  })

  it('renumbers the stage when neighbors are too close, keeping the order', async () => {
    const a = await addLead('Novo', { position: 0 })
    const b = await addLead('Novo', { position: leadModel.MIN_POSITION_GAP / 2 })
    const c = await addLead('Novo', { position: 1 })
    const moving = await addLead('Em contato', { position: 0 })

    await leadModel.move(db, { leadId: moving.id, stageId: stageNamed('Novo').id, beforeLeadId: b.id, userId: null })
    expect(await columnOrder('Novo')).toEqual([a.id, moving.id, b.id, c.id])
    const positions = await db.select({ position: leads.position }).from(leads).where(eq(leads.stageId, stageNamed('Novo').id))
    const sorted = positions.map((row) => row.position).sort((x, y) => x - y)
    for (let i = 1; i < sorted.length; i++) expect(sorted[i]! - sorted[i - 1]!).toBeGreaterThan(leadModel.MIN_POSITION_GAP)
  })

  it('records stage changes in the history, but not reordering within a stage', async () => {
    const bia = await userModel.create(db, { name: 'Bia', email: 'b@x.com', passwordHash: 'h', role: 'attendant', status: 'active' })
    const other = await addLead('Novo', { position: 0 })
    const lead = await addLead('Novo', { position: 1024 })
    const enteredAt = (await leadModel.findById(db, lead.id))!.stageEnteredAt

    await leadModel.move(db, { leadId: lead.id, stageId: stageNamed('Novo').id, beforeLeadId: other.id, userId: bia.id })
    expect(await db.select().from(leadStageChanges)).toHaveLength(0)
    expect((await leadModel.findById(db, lead.id))!.stageEnteredAt).toEqual(enteredAt)

    const moved = await leadModel.move(db, { leadId: lead.id, stageId: stageNamed('Em contato').id, beforeLeadId: null, userId: bia.id })
    expect(moved.stageId).toBe(stageNamed('Em contato').id)
    expect(moved.stageEnteredAt.getTime()).toBeGreaterThanOrEqual(enteredAt.getTime())
    expect(await db.select().from(leadStageChanges)).toEqual([
      expect.objectContaining({
        leadId: lead.id,
        fromStageId: stageNamed('Novo').id,
        toStageId: stageNamed('Em contato').id,
        fromStageName: 'Novo',
        toStageName: 'Em contato',
        changedById: bia.id,
      }),
    ])
  })

  it('stores the lost reason in a lost stage and clears it when leaving', async () => {
    const lead = await addLead('Novo', { position: 0 })
    const lost = await leadModel.move(db, {
      leadId: lead.id,
      stageId: stageNamed('Perdido').id,
      beforeLeadId: null,
      lostReason: 'Preço',
      userId: null,
    })
    expect(lost.lostReason).toBe('Preço')

    const reopened = await leadModel.move(db, { leadId: lead.id, stageId: stageNamed('Novo').id, beforeLeadId: null, userId: null })
    expect(reopened.lostReason).toBeNull()
  })

  it('rejects stages of another pipeline and unknown lead, stage or neighbor', async () => {
    const lead = await addLead('Novo', { position: 0 })
    const elsewhere = await addLead('Proposta', { position: 0 })
    const [other] = await db.insert(pipelines).values({ name: 'Pós-venda' }).returning()
    const [foreignStage] = await db.insert(pipelineStages).values({ pipelineId: other!.id, name: 'Onboarding', position: 0 }).returning()
    const missing = '00000000-0000-0000-0000-000000000000'
    const move = (input: Partial<Parameters<typeof leadModel.move>[1]>) =>
      leadModel.move(db, { leadId: lead.id, stageId: stageNamed('Em contato').id, beforeLeadId: null, userId: null, ...input })

    await expect(move({ stageId: foreignStage!.id })).rejects.toMatchObject({ code: 'STAGE_OTHER_PIPELINE', httpStatus: 422 })
    await expect(move({ leadId: missing })).rejects.toMatchObject({ httpStatus: 404 })
    await expect(move({ stageId: missing })).rejects.toMatchObject({ httpStatus: 404 })
    await expect(move({ beforeLeadId: elsewhere.id })).rejects.toMatchObject({ httpStatus: 404 })
  })
})

describe('lead model: create and contact leads (US2)', () => {
  async function newContact(name = 'Nova') {
    phoneSeq += 1
    const phone = `55319${String(phoneSeq).padStart(8, '0')}`
    const [contact] = await db.insert(contacts).values({ waJid: `${phone}@s.whatsapp.net`, phone, name }).returning()
    return contact!
  }

  it('creates at the top of the first open stage and records the creation in the history', async () => {
    const existing = await addLead('Novo', { position: 0 })
    const contact = await newContact()

    const lead = await leadModel.create(db, { pipelineId, contactId: contact.id, createdById: null })
    expect(lead).toMatchObject({ stageId: stageNamed('Novo').id, position: -leadModel.POSITION_GAP, createdById: null })
    expect(await columnOrder('Novo')).toEqual([lead.id, existing.id])
    expect(await db.select().from(leadStageChanges).where(eq(leadStageChanges.leadId, lead.id))).toEqual([
      expect.objectContaining({ fromStageId: null, toStageId: stageNamed('Novo').id, toStageName: 'Novo', changedById: null }),
    ])
  })

  it('uses the chosen stage, or the lowest stage when none is open, and 0 in an empty stage', async () => {
    const contact = await newContact()
    const chosen = await leadModel.create(db, { pipelineId, contactId: contact.id, stageId: stageNamed('Proposta').id, createdById: null })
    expect(chosen).toMatchObject({ stageId: stageNamed('Proposta').id, position: 0 })

    await db.update(pipelineStages).set({ kind: 'won' }).where(eq(pipelineStages.pipelineId, pipelineId))
    const other = await newContact('Outra')
    const fallback = await leadModel.create(db, { pipelineId, contactId: other.id, createdById: null })
    expect(fallback.stageId).toBe(stageNamed('Novo').id)
  })

  it('refuses a second lead of the same contact in the same pipeline', async () => {
    const contact = await newContact()
    await leadModel.create(db, { pipelineId, contactId: contact.id, createdById: null })
    await expect(leadModel.create(db, { pipelineId, contactId: contact.id, createdById: null })).rejects.toMatchObject({
      code: 'LEAD_EXISTS',
      httpStatus: 409,
    })
    expect(await leadModel.createIfAbsent(db, { pipelineId, contactId: contact.id, createdById: null })).toBeNull()
  })

  it('rejects a stage of another pipeline', async () => {
    const contact = await newContact()
    const [other] = await db.insert(pipelines).values({ name: 'Pós-venda' }).returning()
    const [foreign] = await db.insert(pipelineStages).values({ pipelineId: other!.id, name: 'Onboarding', position: 0 }).returning()
    await expect(
      leadModel.create(db, { pipelineId, contactId: contact.id, stageId: foreign!.id, createdById: null }),
    ).rejects.toMatchObject({ code: 'STAGE_OTHER_PIPELINE' })
  })

  it('lists a contact leads in active pipelines only', async () => {
    const contact = await newContact()
    const [other] = await db.insert(pipelines).values({ name: 'Pós-venda' }).returning()
    const [stage] = await db.insert(pipelineStages).values({ pipelineId: other!.id, name: 'Onboarding', position: 0 }).returning()
    const inVendas = await leadModel.create(db, { pipelineId, contactId: contact.id, createdById: null })
    await leadModel.create(db, { pipelineId: other!.id, contactId: contact.id, stageId: stage!.id, createdById: null })
    expect((await leadModel.listByContact(db, contact.id)).map((l) => l.pipelineId).sort()).toEqual([pipelineId, other!.id].sort())

    await db.update(pipelines).set({ archivedAt: new Date() }).where(eq(pipelines.id, other!.id))
    expect((await leadModel.listByContact(db, contact.id)).map((l) => l.id)).toEqual([inVendas.id])
  })
})

describe('lead model: details, history and removal (US4)', () => {
  it('updates title, value, assignee and notes', async () => {
    const bia = await userModel.create(db, { name: 'Bia', email: 'b@x.com', passwordHash: 'h', role: 'attendant', status: 'active' })
    const lead = await addLead('Novo', { position: 0 })

    const updated = await leadModel.update(db, lead.id, { title: 'Plano anual', valueCents: 500000, assigneeId: bia.id, notes: 'Ligar amanhã' })
    expect(updated).toMatchObject({ title: 'Plano anual', valueCents: 500000, notes: 'Ligar amanhã', assignee: { id: bia.id, name: 'Bia' } })

    const cleared = await leadModel.update(db, lead.id, { title: null, valueCents: null, assigneeId: null })
    expect(cleared).toMatchObject({ title: null, valueCents: null, assignee: null, notes: 'Ligar amanhã' })
    expect(await leadModel.update(db, '00000000-0000-0000-0000-000000000000', { notes: 'x' })).toBeNull()
  })

  it('returns the history newest first with author names (null = automatic)', async () => {
    const bia = await userModel.create(db, { name: 'Bia', email: 'b@x.com', passwordHash: 'h', role: 'attendant', status: 'active' })
    const [contact] = await db.insert(contacts).values({ waJid: '5599@s.whatsapp.net', phone: '5599', name: 'Hist' }).returning()
    const lead = await leadModel.create(db, { pipelineId, contactId: contact!.id, createdById: null })
    await leadModel.move(db, { leadId: lead.id, stageId: stageNamed('Em contato').id, beforeLeadId: null, userId: bia.id })

    const history = await leadModel.history(db, lead.id)
    expect(history.map((h) => [h.fromStageName, h.toStageName, h.changedBy?.name ?? null])).toEqual([
      ['Novo', 'Em contato', 'Bia'],
      [null, 'Novo', null],
    ])
  })

  it('removes a lead with its history, keeping contact and conversation', async () => {
    const lead = await addLead('Novo', { position: 0 })
    await db.insert(conversations).values({ contactId: lead.contactId })
    await db.insert(leadStageChanges).values({ leadId: lead.id, toStageName: 'Novo' })

    expect(await leadModel.remove(db, lead.id)).toMatchObject({ id: lead.id, stageId: stageNamed('Novo').id })
    expect(await leadModel.findById(db, lead.id)).toBeNull()
    expect(await db.select().from(leadStageChanges)).toHaveLength(0)
    expect(await db.select().from(contacts).where(eq(contacts.id, lead.contactId))).toHaveLength(1)
    expect(await db.select().from(conversations)).toHaveLength(1)
    expect(await leadModel.remove(db, lead.id)).toBeNull()
  })
})
