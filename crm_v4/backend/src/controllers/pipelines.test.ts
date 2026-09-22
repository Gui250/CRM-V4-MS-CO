import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as leadModel from '../models/lead.js'
import * as pipelineModel from '../models/pipeline.js'
import * as stageModel from '../models/stage.js'
import type { User } from '../models/user.js'
import { fakeContext } from '../test/context.js'
import { leadFixture, pipelineFixture, stageFixture } from '../test/fixtures.js'
import { toLeadDto, toPipelineDto, toStageDto } from './dto.js'
import * as pipelines from './pipelines.js'

vi.mock('../models/pipeline.js')
vi.mock('../models/stage.js')
vi.mock('../models/lead.js')

const at = new Date('2026-09-22T12:00:00.000Z')
const admin: User = { id: 'u1', name: 'Ana', email: 'a@x.com', role: 'admin', status: 'active', createdAt: at, updatedAt: at }

let fakes: ReturnType<typeof fakeContext>
beforeEach(() => {
  vi.resetAllMocks()
  fakes = fakeContext()
  vi.mocked(pipelineModel.findById).mockResolvedValue(pipelineFixture())
})

const changed = () => expect(fakes.bus.publish).toHaveBeenCalledWith({ type: 'pipeline.changed', data: { pipelineId: 'p1' } })

describe('pipelines controller', () => {
  it('lists, creates and updates pipelines, announcing structure changes', async () => {
    vi.mocked(pipelineModel.list).mockResolvedValue([pipelineFixture()])
    expect(await pipelines.listPipelines(fakes.ctx, { includeArchived: false })).toEqual([toPipelineDto(pipelineFixture())])

    vi.mocked(pipelineModel.create).mockResolvedValue(pipelineFixture({ name: 'Pós-venda' }))
    expect((await pipelines.createPipeline(fakes.ctx, 'Pós-venda')).name).toBe('Pós-venda')
    changed()

    vi.mocked(pipelineModel.update).mockResolvedValue(pipelineFixture({ isEntry: true }))
    expect((await pipelines.updatePipeline(fakes.ctx, 'p1', { isEntry: true })).isEntry).toBe(true)
    vi.mocked(pipelineModel.update).mockResolvedValue(null)
    await expect(pipelines.updatePipeline(fakes.ctx, 'x', { name: 'y' })).rejects.toMatchObject({ httpStatus: 404 })
  })

  it('creates, updates and reorders stages of an existing pipeline', async () => {
    vi.mocked(stageModel.create).mockResolvedValue(stageFixture({ id: 's9', name: 'Onboarding' }))
    expect(await pipelines.createStage(fakes.ctx, 'p1', { name: 'Onboarding' })).toEqual(toStageDto(stageFixture({ id: 's9', name: 'Onboarding' })))
    changed()

    vi.mocked(stageModel.update).mockResolvedValue(stageFixture({ name: 'Entrada' }))
    expect((await pipelines.updateStage(fakes.ctx, 'p1', 's1', { name: 'Entrada' })).name).toBe('Entrada')
    await expect(pipelines.updateStage(fakes.ctx, 'p1', 'other-pipeline-stage', { name: 'x' })).rejects.toMatchObject({ httpStatus: 404 })

    vi.mocked(stageModel.reorder).mockResolvedValue([stageFixture()])
    expect(await pipelines.reorderStages(fakes.ctx, 'p1', ['s1'])).toEqual([toStageDto(stageFixture())])

    vi.mocked(pipelineModel.findById).mockResolvedValue(null)
    await expect(pipelines.createStage(fakes.ctx, 'x', { name: 'y' })).rejects.toMatchObject({ httpStatus: 404 })
  })

  it('deletes a stage and announces every relocated lead with its previous column', async () => {
    const moved = leadFixture({ stageId: 's2' })
    vi.mocked(stageModel.remove).mockResolvedValue({
      pipelineId: 'p1',
      relocated: [{ leadId: 'l1', previous: { stageId: 's1', valueCents: null } }],
    })
    vi.mocked(leadModel.findById).mockResolvedValue(moved)

    await pipelines.deleteStage(fakes.ctx, admin, 'p1', 's1', 's2')

    expect(stageModel.remove).toHaveBeenCalledWith(fakes.ctx.db, { stageId: 's1', moveToStageId: 's2', userId: 'u1' })
    expect(fakes.bus.publish).toHaveBeenCalledWith({
      type: 'lead.upserted',
      data: { lead: toLeadDto(moved), previous: { stageId: 's1', valueCents: null } },
    })
    changed()
  })
})
