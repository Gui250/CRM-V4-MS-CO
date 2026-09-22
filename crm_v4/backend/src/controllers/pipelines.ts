import type { AppContext } from '../context.js'
import { notFound } from '../lib/errors.js'
import * as leadModel from '../models/lead.js'
import * as pipelineModel from '../models/pipeline.js'
import * as stageModel from '../models/stage.js'
import type { User } from '../models/user.js'
import type { StageRow } from '../db/schema.js'
import { toLeadDto, toPipelineDto, toStageDto } from './dto.js'

type StageInput = Partial<Pick<StageRow, 'name' | 'color' | 'kind'>>

// Structure changes are rare, so clients just refetch the pipeline and its boards.
const publishChanged = (ctx: AppContext, pipelineId: string) => ctx.bus.publish({ type: 'pipeline.changed', data: { pipelineId } })

async function loadPipeline(ctx: AppContext, pipelineId: string) {
  const pipeline = await pipelineModel.findById(ctx.db, pipelineId)
  if (!pipeline) throw notFound('Funil não encontrado.')
  return pipeline
}

async function assertStageInPipeline(ctx: AppContext, pipelineId: string, stageId: string) {
  const pipeline = await loadPipeline(ctx, pipelineId)
  if (!pipeline.stages.some((stage) => stage.id === stageId)) throw notFound('Etapa não encontrada.')
}

export async function listPipelines(ctx: AppContext, options: { includeArchived: boolean }) {
  return (await pipelineModel.list(ctx.db, options)).map(toPipelineDto)
}

export async function createPipeline(ctx: AppContext, name: string) {
  const pipeline = await pipelineModel.create(ctx.db, name)
  publishChanged(ctx, pipeline.id)
  return toPipelineDto(pipeline)
}

export async function updatePipeline(ctx: AppContext, pipelineId: string, changes: { name?: string; isEntry?: boolean; archived?: boolean }) {
  const pipeline = await pipelineModel.update(ctx.db, pipelineId, changes)
  if (!pipeline) throw notFound('Funil não encontrado.')
  publishChanged(ctx, pipelineId)
  return toPipelineDto(pipeline)
}

export async function createStage(ctx: AppContext, pipelineId: string, input: StageInput & { name: string }) {
  await loadPipeline(ctx, pipelineId)
  const stage = await stageModel.create(ctx.db, pipelineId, input)
  publishChanged(ctx, pipelineId)
  return toStageDto(stage)
}

export async function updateStage(ctx: AppContext, pipelineId: string, stageId: string, input: StageInput) {
  await assertStageInPipeline(ctx, pipelineId, stageId)
  const stage = await stageModel.update(ctx.db, stageId, input)
  if (!stage) throw notFound('Etapa não encontrada.')
  publishChanged(ctx, pipelineId)
  return toStageDto(stage)
}

export async function reorderStages(ctx: AppContext, pipelineId: string, stageIds: string[]) {
  await loadPipeline(ctx, pipelineId)
  const stages = await stageModel.reorder(ctx.db, pipelineId, stageIds)
  publishChanged(ctx, pipelineId)
  return stages.map(toStageDto)
}

export async function deleteStage(ctx: AppContext, user: User, pipelineId: string, stageId: string, moveToStageId?: string) {
  await assertStageInPipeline(ctx, pipelineId, stageId)
  const { relocated } = await stageModel.remove(ctx.db, { stageId, ...(moveToStageId ? { moveToStageId } : {}), userId: user.id })
  for (const { leadId, previous } of relocated) {
    const lead = await leadModel.findById(ctx.db, leadId)
    if (lead) ctx.bus.publish({ type: 'lead.upserted', data: { lead: toLeadDto(lead), previous } })
  }
  publishChanged(ctx, pipelineId)
}
