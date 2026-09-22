import { randomUUID } from 'node:crypto'
import type { Readable } from 'node:stream'
import type { AppContext } from '../context.js'
import { conflict, DomainError, notFound } from '../lib/errors.js'
import * as contactModel from '../models/contact.js'
import * as conversationModel from '../models/conversation.js'
import * as flowModel from '../models/flow.js'
import * as runModel from '../models/flow-run.js'
import type { User } from '../models/user.js'
import { findAgentForValidation } from './ai-agents.js'
import * as engine from './automation/engine.js'
import { type FlowGraph, flowGraphSchema, triggerTypeOf } from './automation/graph-schema.js'
import { type GraphIssue, validateForActivation } from './automation/graph-validation.js'
import { toFlowDto, toFlowSummaryDto, toRunSummaryDto } from './automation-dto.js'
import { classifyUpload } from './messages.js'

// Flows: editor CRUD, versions, activation and test runs (US1, US5). Admin-only at the route.

export const ASSET_PREFIX = 'automation'
const FILENAME_MAX = 120

const invalidFlow = (issues: GraphIssue[]) =>
  new DomainError('INVALID_FLOW', 'O fluxo tem problemas. Corrija os blocos destacados.', 422, { issues })

async function load(ctx: AppContext, id: string) {
  const flow = await flowModel.findById(ctx.db, id)
  if (!flow) throw notFound('Fluxo não encontrado.')
  return flow
}

async function mediaExists(ctx: AppContext, mediaPath: string) {
  const stream = await ctx.storage.get(mediaPath)
  stream?.destroy()
  return stream !== null
}

async function assertActivatable(ctx: AppContext, graph: FlowGraph) {
  const issues = await validateForActivation(graph, {
    findAgent: (agentId) => findAgentForValidation(ctx, agentId),
    mediaExists: (path) => mediaExists(ctx, path),
  })
  if (issues.length > 0) throw invalidFlow(issues)
}

export async function list(ctx: AppContext, filters: { status?: flowModel.FlowStatus; trigger?: flowModel.FlowTrigger } = {}) {
  return (await flowModel.list(ctx.db, filters)).map(toFlowSummaryDto)
}

export async function get(ctx: AppContext, id: string) {
  return toFlowDto(await load(ctx, id))
}

export async function create(ctx: AppContext, user: User, input: { name: string; description?: string | null }) {
  return toFlowDto(await flowModel.create(ctx.db, { name: input.name.trim(), description: input.description?.trim() || null, userId: user.id }))
}

export async function update(
  ctx: AppContext,
  user: User,
  id: string,
  patch: { name?: string; description?: string | null; priority?: number },
) {
  await load(ctx, id)
  const updated = await flowModel.update(ctx.db, id, {
    ...patch,
    ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
    ...(patch.description !== undefined ? { description: patch.description?.trim() || null } : {}),
    userId: user.id,
  })
  return toFlowDto(updated!)
}

/** Every save is a new version (FR-007). An active flow only accepts a valid graph. */
export async function saveGraph(ctx: AppContext, user: User, id: string, graph: FlowGraph) {
  const flow = await load(ctx, id)
  if (flow.status === 'active') await assertActivatable(ctx, graph)
  await flowModel.saveVersion(ctx.db, { flowId: id, graph, triggerType: triggerTypeOf(graph), userId: user.id })
  return get(ctx, id)
}

export async function activate(ctx: AppContext, user: User, id: string) {
  const flow = await load(ctx, id)
  if (!flow.graph) throw invalidFlow([{ message: 'Salve o fluxo antes de ativar.' }])
  await assertActivatable(ctx, flowGraphSchema.parse(flow.graph))
  await flowModel.setStatus(ctx.db, id, 'active', user.id)
  return get(ctx, id)
}

/** Stops new runs and cancels the ones in progress (US1 scenario 6). */
export async function deactivate(ctx: AppContext, user: User, id: string) {
  await load(ctx, id)
  await flowModel.setStatus(ctx.db, id, 'inactive', user.id)
  for (const runId of await runModel.cancelActiveForFlow(ctx.db, id, 'flow_deactivated')) {
    const run = await runModel.findById(ctx.db, runId)
    if (run) ctx.bus.publish({ type: 'run.updated', data: { run: toRunSummaryDto(run) } })
  }
  return get(ctx, id)
}

async function copyName(ctx: AppContext, name: string) {
  const taken = new Set((await flowModel.list(ctx.db)).map((f) => f.name))
  for (let n = 1; ; n += 1) {
    const candidate = n === 1 ? `${name} (cópia)` : `${name} (cópia ${n})`
    if (!taken.has(candidate)) return candidate
  }
}

export async function duplicate(ctx: AppContext, user: User, id: string) {
  const source = await load(ctx, id)
  const copy = await flowModel.create(ctx.db, { name: await copyName(ctx, source.name), description: source.description, userId: user.id })
  if (source.graph) {
    await flowModel.saveVersion(ctx.db, { flowId: copy.id, graph: source.graph, triggerType: source.triggerType, userId: user.id })
  }
  return get(ctx, copy.id)
}

export async function remove(ctx: AppContext, id: string) {
  const flow = await load(ctx, id)
  if (flow.status === 'active') throw conflict('FLOW_ACTIVE', 'Desative o fluxo antes de excluir.')
  await flowModel.remove(ctx.db, id)
}

const safeFilename = (name: string) =>
  name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^[-.]+/, '')
    .slice(-FILENAME_MAX) || 'arquivo'

/** Files for the send_media block; same types and limits as the chat (research §10). */
export async function uploadAsset(ctx: AppContext, file: { data: Buffer; mime: string; filename: string }) {
  classifyUpload(file.mime, file.data.length)
  const filename = safeFilename(file.filename)
  const mediaPath = `${ASSET_PREFIX}/${randomUUID()}/${filename}`
  await ctx.storage.put(mediaPath, file.data, file.mime)
  return { mediaPath, mime: file.mime, filename, size: file.data.length }
}

export async function getAsset(ctx: AppContext, mediaPath: string): Promise<Readable> {
  if (!mediaPath.startsWith(`${ASSET_PREFIX}/`) || mediaPath.includes('..')) throw notFound('Arquivo não encontrado.')
  const stream = await ctx.storage.get(mediaPath)
  if (!stream) throw notFound('Arquivo não encontrado.')
  return stream
}

/** Runs the editor's graph for real on one test number, ignoring status and priority (FR-014). */
export async function startTest(ctx: AppContext, user: User, id: string, input: { graph: FlowGraph; phone: string }) {
  await load(ctx, id)
  await assertActivatable(ctx, input.graph)
  await flowModel.saveVersion(ctx.db, { flowId: id, graph: input.graph, triggerType: triggerTypeOf(input.graph), userId: user.id })
  const { contact } = await contactModel.upsertByJid(ctx.db, { waJid: `${input.phone}@s.whatsapp.net`, name: null })
  const conversation = await conversationModel.getOrCreateForContact(ctx.db, contact.id)
  if (conversation.handlingMode === 'human') await conversationModel.release(ctx.db, conversation.id)
  const { run, done } = await engine.start(ctx, { flow: await load(ctx, id), conversationId: conversation.id, origin: 'test', userId: user.id })
  done.catch((error: unknown) => ctx.log.error({ err: error, runId: run.id }, 'test run failed'))
  return toRunSummaryDto(run)
}
