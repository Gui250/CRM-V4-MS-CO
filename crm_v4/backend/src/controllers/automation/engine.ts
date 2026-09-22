import type { AppContext } from '../../context.js'
import type { FlowRunRow } from '../../db/schema.js'
import * as conversationModel from '../../models/conversation.js'
import * as flowModel from '../../models/flow.js'
import * as runModel from '../../models/flow-run.js'
import { toRunSummaryDto } from '../automation-dto.js'
import * as handling from '../handling.js'
import { type FlowGraph, flowGraphSchema, type FlowNode, isTrigger } from './graph-schema.js'
import { executors } from './nodes/index.js'
import type { NodeResult, RunState } from './nodes/types.js'

// Durable interpreter for flow graphs (research §3). State lives in flow_runs; waits park the run
// with resume_at and the worker (jobs/automation-worker.ts) picks it up again.

export const MAX_STEPS = 100
export const RUN_LEASE_MS = 60_000
export const TICK_BATCH = 20
export const RUN_RETENTION_DAYS = 90
const DAY_MS = 86_400_000

const LOOP_LIMIT = `A execução passou de ${MAX_STEPS} blocos e foi interrompida.`
const BLOCK_FAILED_REASON = 'Falha na automação'

type Resume = { reply: boolean } | null

function publish(ctx: AppContext, run: runModel.RunWithContext | null) {
  if (run) ctx.bus.publish({ type: 'run.updated', data: { run: toRunSummaryDto(run) } })
}

async function fail(ctx: AppContext, runId: string, error: string, endReason: runModel.RunEndReason = 'error') {
  publish(ctx, await runModel.finish(ctx.db, runId, { status: 'failed', endReason, error }))
}

/** Starts a run on the flow's current version at its trigger block. `done` settles when the first stretch of blocks ran. */
export async function start(
  ctx: AppContext,
  input: { flow: flowModel.FlowWithVersion; conversationId: string; origin: runModel.RunOrigin; userId: string | null },
): Promise<{ run: runModel.RunWithContext; done: Promise<void> }> {
  const graph = flowGraphSchema.parse(input.flow.graph)
  const triggerNode = graph.nodes.find((n) => isTrigger(n.type))
  if (!input.flow.currentVersionId || !triggerNode) throw new Error(`flow ${input.flow.id} has no startable version`)
  const run = await runModel.create(ctx.db, {
    flowId: input.flow.id,
    versionId: input.flow.currentVersionId,
    conversationId: input.conversationId,
    origin: input.origin,
    startedByUserId: input.userId,
    currentNodeId: triggerNode.id,
  })
  publish(ctx, run)
  return { run, done: resume(ctx, run.id, null) }
}

/** Claims the run and advances it; errors are logged, never thrown (callers fire and forget). */
export async function resume(ctx: AppContext, runId: string, reason: Resume, now = new Date()): Promise<void> {
  try {
    const claimed = await runModel.claim(ctx.db, runId, now, RUN_LEASE_MS)
    if (claimed) await advance(ctx, claimed, reason, now)
  } catch (error) {
    ctx.log.error({ err: error, runId }, 'automation run failed to advance')
  }
}

async function loadRun(ctx: AppContext, run: FlowRunRow) {
  const [flow, version, conversation] = await Promise.all([
    flowModel.findById(ctx.db, run.flowId),
    flowModel.findVersion(ctx.db, run.versionId),
    conversationModel.findById(ctx.db, run.conversationId),
  ])
  if (!flow || !version || !conversation) return null
  return { flow, graph: flowGraphSchema.parse(version.graph), conversation }
}

const nextNodeId = (graph: FlowGraph, nodeId: string, handle: string) =>
  graph.edges.find((e) => e.source === nodeId && e.sourceHandle === handle)?.target ?? null

async function execute(ctx: AppContext, node: FlowNode, input: Parameters<NonNullable<(typeof executors)['end']>>[2]) {
  const executor = executors[node.type] as (...args: unknown[]) => Promise<NodeResult>
  return executor(ctx, node, input)
}

/** Runs blocks until one waits or the run ends. The run must be claimed (status running, lease held). */
// eslint-disable-next-line max-lines-per-function -- one loop with a branch per block result, easier to follow in one place
export async function advance(ctx: AppContext, claimed: FlowRunRow, reason: Resume, now = new Date()): Promise<void> {
  const loaded = await loadRun(ctx, claimed)
  if (!loaded) return fail(ctx, claimed.id, 'Fluxo, versão ou conversa não existe mais.')
  const { flow, graph, conversation } = loaded
  if (flow.status !== 'active' && claimed.origin !== 'test') {
    publish(ctx, await runModel.finish(ctx.db, claimed.id, { status: 'cancelled', endReason: 'flow_deactivated' }))
    return
  }

  let nodeId = claimed.currentNodeId
  let state = (claimed.state ?? {}) as RunState
  let steps = claimed.stepsCount
  let resumeReason = reason

  while (nodeId) {
    if (steps >= MAX_STEPS) return fail(ctx, claimed.id, LOOP_LIMIT, 'loop_limit')
    const node = graph.nodes.find((n) => n.id === nodeId)
    if (!node) return fail(ctx, claimed.id, `Bloco ${nodeId} não existe na versão ${claimed.versionId}.`)

    const startedAt = new Date()
    let result: NodeResult
    try {
      result = await execute(ctx, node, { run: { ...claimed, state }, conversation, resume: resumeReason, now })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await runModel.addStep(ctx.db, { runId: claimed.id, nodeId: node.id, nodeType: node.type, status: 'failed', error: message, startedAt })
      await fail(ctx, claimed.id, message)
      await handling.handOff(ctx, conversation.id, { reason: BLOCK_FAILED_REASON })
      return
    }
    steps += 1
    const blockError = 'handOff' in result ? result.error : undefined
    await runModel.addStep(ctx.db, {
      runId: claimed.id,
      nodeId: node.id,
      nodeType: node.type,
      status: blockError === undefined ? 'ok' : 'failed',
      output: result.output,
      error: blockError ?? null,
      startedAt,
    })

    if ('wait' in result) {
      const updated = await runModel.update(ctx.db, claimed.id, {
        status: 'waiting',
        currentNodeId: node.id,
        state: result.wait.state,
        resumeAt: result.wait.resumeAt,
        leaseUntil: null,
        stepsCount: steps,
      })
      publish(ctx, updated)
      return
    }
    if ('complete' in result) {
      await runModel.update(ctx.db, claimed.id, { stepsCount: steps, currentNodeId: node.id })
      publish(ctx, await runModel.finish(ctx.db, claimed.id, { status: 'completed', endReason: 'completed' }))
      return
    }
    if ('handOff' in result) {
      await runModel.update(ctx.db, claimed.id, { stepsCount: steps, currentNodeId: node.id })
      // A failure ends the run as failed first; a planned hand-off is cancelled by handOff itself.
      if (result.error !== undefined) await fail(ctx, claimed.id, result.error)
      await handling.handOff(ctx, conversation.id, result.handOff)
      return
    }

    const target = nextNodeId(graph, node.id, result.next)
    if (!target) {
      await runModel.update(ctx.db, claimed.id, { stepsCount: steps, currentNodeId: node.id })
      publish(ctx, await runModel.finish(ctx.db, claimed.id, { status: 'completed', endReason: 'completed' }))
      return
    }
    nodeId = target
    state = {}
    resumeReason = null
    publish(
      ctx,
      await runModel.update(ctx.db, claimed.id, {
        currentNodeId: target,
        state,
        stepsCount: steps,
        leaseUntil: new Date(now.getTime() + RUN_LEASE_MS),
      }),
    )
  }
}

/** Stops a run (chat "Parar", deactivation). Returns null when it had already finished. */
export async function cancel(ctx: AppContext, runId: string, endReason: runModel.RunEndReason) {
  const run = await runModel.finish(ctx.db, runId, { status: 'cancelled', endReason })
  publish(ctx, run)
  return run
}

/** Worker entry point: advances every due run; one failing run never blocks the others. */
export async function tick(ctx: AppContext, now: Date): Promise<number> {
  const due = await runModel.claimDue(ctx.db, now, RUN_LEASE_MS, TICK_BATCH)
  for (const run of due) {
    try {
      await advance(ctx, run, null, now)
    } catch (error) {
      ctx.log.error({ err: error, runId: run.id }, 'automation run failed to advance')
    }
  }
  return due.length
}

/** Retention (FR-013), called hourly by the worker. */
export async function cleanup(ctx: AppContext, now: Date): Promise<void> {
  await runModel.deleteFinishedBefore(ctx.db, new Date(now.getTime() - RUN_RETENTION_DAYS * DAY_MS))
  await runModel.deleteOrphanVersions(ctx.db)
}
