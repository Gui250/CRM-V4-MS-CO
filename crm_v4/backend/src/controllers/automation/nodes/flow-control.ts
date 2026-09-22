import { durationMs } from '../graph-schema.js'
import type { NodeExecutor, NodeResult } from './types.js'

// Blocks that only move the run along: triggers, waits, end and hand-off.

/** Works for both trigger types: the run starts on the trigger block and moves on. */
export const trigger = async (): Promise<NodeResult> => ({ next: 'next' })

export const end: NodeExecutor<'end'> = async () => ({ complete: true })

export const handoff: NodeExecutor<'handoff'> = async (_ctx, node) => ({ handOff: { reason: node.config.reason } })

/** First entry schedules the resume; re-entry (resume_at passed) moves on. */
export const wait: NodeExecutor<'wait'> = async (_ctx, node, { run, now }) => {
  if (typeof run.state.waitUntil === 'string') return { next: 'next' }
  const resumeAt = new Date(now.getTime() + durationMs(node.config))
  return { wait: { resumeAt, state: { waitUntil: resumeAt.toISOString() } } }
}

/** Waits for the contact's next message (resume.reply) or the timeout (resume_at passed). */
export const waitReply: NodeExecutor<'wait_reply'> = async (_ctx, node, { run, resume, now }) => {
  if (typeof run.state.timeoutAt !== 'string') {
    const timeoutAt = new Date(now.getTime() + durationMs(node.config.timeout))
    return { wait: { resumeAt: timeoutAt, state: { awaitingReply: true, timeoutAt: timeoutAt.toISOString() } } }
  }
  if (resume?.reply) return { next: 'replied' }
  const timeoutAt = new Date(run.state.timeoutAt)
  if (now >= timeoutAt) return { next: 'timeout' }
  return { wait: { resumeAt: timeoutAt, state: run.state } }
}
