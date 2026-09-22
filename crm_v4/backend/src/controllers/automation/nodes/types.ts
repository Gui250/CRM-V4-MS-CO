import type { AppContext } from '../../../context.js'
import type { FlowRunRow } from '../../../db/schema.js'
import type { ConversationWithContact } from '../../../models/conversation.js'
import type { NodeOfType, NodeType } from '../graph-schema.js'

export type RunState = Record<string, unknown>

export interface NodeInput {
  run: Pick<FlowRunRow, 'id' | 'conversationId' | 'origin'> & { state: RunState }
  conversation: ConversationWithContact
  /** Why a waiting block is re-entered: a contact reply, or the worker because resume_at passed. */
  resume: { reply: boolean } | null
  now: Date
}

/** What the engine does after a block. `output` is recorded in the run step. */
export type NodeResult =
  | { next: string; output?: unknown }
  | { wait: { resumeAt: Date | null; state: RunState }; output?: unknown }
  | { complete: true; output?: unknown }
  | { handOff: { reason: string; summary?: string | null }; error?: string; output?: unknown }

export type NodeExecutor<T extends NodeType> = (ctx: AppContext, node: NodeOfType<T>, input: NodeInput) => Promise<NodeResult>
