import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as contactModel from '../models/contact.js'
import * as leadModel from '../models/lead.js'
import * as pipelineModel from '../models/pipeline.js'
import * as userModel from '../models/user.js'
import type { User } from '../models/user.js'
import { fakeContext } from '../test/context.js'
import { leadFixture, pipelineFixture } from '../test/fixtures.js'
import { toLeadDetailDto, toLeadDto } from './dto.js'
import * as leads from './leads.js'

vi.mock('../models/lead.js', async (importOriginal) => ({
  ...(await importOriginal<typeof leadModel>()),
  findById: vi.fn(),
  stageSummaries: vi.fn(),
  listByStage: vi.fn(),
  move: vi.fn(),
  create: vi.fn(),
  createIfAbsent: vi.fn(),
  listByContact: vi.fn(),
  update: vi.fn(),
  history: vi.fn(),
  remove: vi.fn(),
}))
vi.mock('../models/user.js')
vi.mock('../models/pipeline.js')
vi.mock('../models/contact.js')

const at = new Date('2026-09-22T12:00:00.000Z')
const user: User = { id: 'u1', name: 'Bia', email: 'b@x.com', role: 'attendant', status: 'active', createdAt: at, updatedAt: at }

let fakes: ReturnType<typeof fakeContext>
beforeEach(() => {
  vi.resetAllMocks()
  fakes = fakeContext()
})

describe('leads controller: board', () => {
  it('returns each stage with its summary and first page, resolving assignee=me', async () => {
    vi.mocked(pipelineModel.findById).mockResolvedValue(pipelineFixture())
    vi.mocked(leadModel.stageSummaries).mockResolvedValue(new Map([['s1', { leadCount: 1, valueTotalCents: 900 }]]))
    vi.mocked(leadModel.listByStage).mockImplementation(async (_db, stageId) =>
      stageId === 's1' ? { items: [leadFixture()], nextCursor: 'more' } : { items: [], nextCursor: null },
    )

    const board = await leads.getBoard(fakes.ctx, user, 'p1', { assignee: 'me', search: 'car' })

    const filter = { assigneeId: 'u1', search: 'car' }
    expect(leadModel.stageSummaries).toHaveBeenCalledWith(fakes.ctx.db, 'p1', filter)
    expect(leadModel.listByStage).toHaveBeenCalledWith(fakes.ctx.db, 's1', { limit: leads.BOARD_PAGE_SIZE, filter })
    expect(board.pipeline.name).toBe('Vendas')
    expect(board.stages[0]).toMatchObject({ id: 's1', leadCount: 1, valueTotalCents: 900, nextCursor: 'more', leads: [{ id: 'l1' }] })
    expect(board.stages[1]).toMatchObject({ id: 's2', leadCount: 0, valueTotalCents: 0, leads: [], nextCursor: null })
  })

  it('404s for unknown or archived pipelines', async () => {
    vi.mocked(pipelineModel.findById).mockResolvedValue(null)
    await expect(leads.getBoard(fakes.ctx, user, 'x', {})).rejects.toMatchObject({ httpStatus: 404 })
    vi.mocked(pipelineModel.findById).mockResolvedValue(pipelineFixture({ archivedAt: at }))
    await expect(leads.getBoard(fakes.ctx, user, 'p1', {})).rejects.toMatchObject({ httpStatus: 404 })
  })

  it('pages one stage, 404 when the stage belongs to another pipeline', async () => {
    vi.mocked(pipelineModel.findById).mockResolvedValue(pipelineFixture())
    vi.mocked(leadModel.listByStage).mockResolvedValue({ items: [leadFixture()], nextCursor: null })

    const page = await leads.listStageLeads(fakes.ctx, user, 'p1', 's2', { cursor: 'c', limit: 10, assignee: 'none' })
    expect(leadModel.listByStage).toHaveBeenCalledWith(fakes.ctx.db, 's2', { cursor: 'c', limit: 10, filter: { assigneeId: 'none' } })
    expect(page).toEqual({ items: [toLeadDto(leadFixture())], nextCursor: null })

    await expect(leads.listStageLeads(fakes.ctx, user, 'p1', 'other', { limit: 10 })).rejects.toMatchObject({ httpStatus: 404 })
  })
})

describe('leads controller: move', () => {
  it('moves, publishes lead.upserted and returns the DTO', async () => {
    const moved = leadFixture({ stageId: 's2' })
    vi.mocked(pipelineModel.findById).mockResolvedValue(pipelineFixture())
    vi.mocked(leadModel.findById).mockResolvedValue(leadFixture())
    vi.mocked(leadModel.move).mockResolvedValue(moved)

    const result = await leads.moveLead(fakes.ctx, user, 'l1', { stageId: 's2', beforeLeadId: null })

    expect(leadModel.move).toHaveBeenCalledWith(fakes.ctx.db, { leadId: 'l1', stageId: 's2', beforeLeadId: null, lostReason: undefined, userId: 'u1' })
    expect(result).toEqual(toLeadDto(moved))
    expect(fakes.bus.publish).toHaveBeenCalledWith({
      type: 'lead.upserted',
      data: { lead: toLeadDto(moved), previous: { stageId: 's1', valueCents: null } },
    })
  })

  it('requires a trimmed lost reason of 1–200 characters for a lost stage', async () => {
    vi.mocked(pipelineModel.findById).mockResolvedValue(pipelineFixture())
    vi.mocked(leadModel.findById).mockResolvedValue(leadFixture())
    vi.mocked(leadModel.move).mockResolvedValue(leadFixture({ stageId: 's3', lostReason: 'Preço' }))

    for (const lostReason of [undefined, '   ', 'x'.repeat(201)]) {
      await expect(leads.moveLead(fakes.ctx, user, 'l1', { stageId: 's3', lostReason })).rejects.toMatchObject({
        code: 'LOST_REASON_REQUIRED',
        httpStatus: 422,
      })
    }
    await leads.moveLead(fakes.ctx, user, 'l1', { stageId: 's3', lostReason: '  Preço ' })
    expect(leadModel.move).toHaveBeenCalledWith(fakes.ctx.db, expect.objectContaining({ lostReason: 'Preço', beforeLeadId: null }))
  })

  it('404s for an unknown lead', async () => {
    vi.mocked(leadModel.findById).mockResolvedValue(null)
    await expect(leads.moveLead(fakes.ctx, user, 'x', { stageId: 's2' })).rejects.toMatchObject({ httpStatus: 404 })
  })
})

describe('leads controller: create and WhatsApp entry (US2)', () => {
  it('creates a lead from a contact and publishes it as new', async () => {
    const created = leadFixture()
    vi.mocked(pipelineModel.findById).mockResolvedValue(pipelineFixture())
    vi.mocked(contactModel.findById).mockResolvedValue(leadFixture().contact)
    vi.mocked(leadModel.create).mockResolvedValue(created)

    expect(await leads.createLead(fakes.ctx, user, { pipelineId: 'p1', contactId: 'c1' })).toEqual(toLeadDto(created))
    expect(leadModel.create).toHaveBeenCalledWith(fakes.ctx.db, { pipelineId: 'p1', contactId: 'c1', createdById: 'u1' })
    expect(fakes.bus.publish).toHaveBeenCalledWith({ type: 'lead.upserted', data: { lead: toLeadDto(created), previous: null } })
  })

  it('refuses unknown or archived pipelines and unknown contacts', async () => {
    vi.mocked(pipelineModel.findById).mockResolvedValue(null)
    await expect(leads.createLead(fakes.ctx, user, { pipelineId: 'x', contactId: 'c1' })).rejects.toMatchObject({ httpStatus: 404 })
    vi.mocked(pipelineModel.findById).mockResolvedValue(pipelineFixture({ archivedAt: at }))
    await expect(leads.createLead(fakes.ctx, user, { pipelineId: 'p1', contactId: 'c1' })).rejects.toMatchObject({ code: 'PIPELINE_ARCHIVED' })
    vi.mocked(pipelineModel.findById).mockResolvedValue(pipelineFixture())
    vi.mocked(contactModel.findById).mockResolvedValue(null)
    await expect(leads.createLead(fakes.ctx, user, { pipelineId: 'p1', contactId: 'x' })).rejects.toMatchObject({ httpStatus: 404 })
  })

  it('lists the contact leads as DTOs', async () => {
    vi.mocked(leadModel.listByContact).mockResolvedValue([leadFixture()])
    expect(await leads.listContactLeads(fakes.ctx, 'c1')).toEqual([toLeadDto(leadFixture())])
  })

  it('enters new contacts in the entry pipeline once, and never throws', async () => {
    vi.mocked(pipelineModel.findEntry).mockResolvedValue(null)
    await leads.enterFromWhatsApp(fakes.ctx, 'c1')
    expect(leadModel.createIfAbsent).not.toHaveBeenCalled()

    vi.mocked(pipelineModel.findEntry).mockResolvedValue(pipelineFixture())
    vi.mocked(leadModel.createIfAbsent).mockResolvedValue(leadFixture())
    await leads.enterFromWhatsApp(fakes.ctx, 'c1')
    expect(leadModel.createIfAbsent).toHaveBeenCalledWith(fakes.ctx.db, { pipelineId: 'p1', contactId: 'c1', createdById: null })
    expect(fakes.bus.publish).toHaveBeenCalledTimes(1)

    vi.mocked(leadModel.createIfAbsent).mockResolvedValue(null)
    await leads.enterFromWhatsApp(fakes.ctx, 'c1')
    expect(fakes.bus.publish).toHaveBeenCalledTimes(1)

    vi.mocked(leadModel.createIfAbsent).mockRejectedValue(new Error('db down'))
    await expect(leads.enterFromWhatsApp(fakes.ctx, 'c1')).resolves.toBeUndefined()
    expect(fakes.log.error).toHaveBeenCalled()
  })
})

describe('leads controller: details (US4)', () => {
  it('returns the lead with its history, 404 when unknown', async () => {
    vi.mocked(leadModel.findById).mockResolvedValue(leadFixture())
    vi.mocked(leadModel.history).mockResolvedValue([])
    expect(await leads.getLead(fakes.ctx, 'l1')).toEqual(toLeadDetailDto(leadFixture(), []))
    vi.mocked(leadModel.findById).mockResolvedValue(null)
    await expect(leads.getLead(fakes.ctx, 'x')).rejects.toMatchObject({ httpStatus: 404 })
  })

  it('updates fields, publishing the previous value for column totals', async () => {
    const updated = leadFixture({ valueCents: 500000 })
    vi.mocked(leadModel.findById).mockResolvedValue(leadFixture({ valueCents: 100 }))
    vi.mocked(leadModel.update).mockResolvedValue(updated)
    vi.mocked(userModel.findById).mockResolvedValue(user)

    expect(await leads.updateLead(fakes.ctx, 'l1', { valueCents: 500000, assigneeId: 'u1' })).toEqual(toLeadDto(updated))
    expect(fakes.bus.publish).toHaveBeenCalledWith({
      type: 'lead.upserted',
      data: { lead: toLeadDto(updated), previous: { stageId: 's1', valueCents: 100 } },
    })
  })

  it('only accepts active users as assignee', async () => {
    vi.mocked(leadModel.findById).mockResolvedValue(leadFixture())
    for (const found of [null, { ...user, status: 'disabled' as const }]) {
      vi.mocked(userModel.findById).mockResolvedValue(found)
      await expect(leads.updateLead(fakes.ctx, 'l1', { assigneeId: 'u9' })).rejects.toMatchObject({ code: 'ASSIGNEE_INVALID', httpStatus: 422 })
    }
    expect(leadModel.update).not.toHaveBeenCalled()
  })

  it('deletes a lead and announces it with its column and value', async () => {
    vi.mocked(leadModel.remove).mockResolvedValue({ ...leadFixture({ valueCents: 900 }) })
    await leads.deleteLead(fakes.ctx, 'l1')
    expect(fakes.bus.publish).toHaveBeenCalledWith({
      type: 'lead.deleted',
      data: { leadId: 'l1', pipelineId: 'p1', stageId: 's1', contactId: 'c1', valueCents: 900 },
    })
    vi.mocked(leadModel.remove).mockResolvedValue(null)
    await expect(leads.deleteLead(fakes.ctx, 'x')).rejects.toMatchObject({ httpStatus: 404 })
  })
})
