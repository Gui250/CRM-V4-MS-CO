import type { AppContext } from '../../context.js'
import type { ContactRow, ConversationRow, MessageRow } from '../../db/schema.js'
import * as flowModel from '../../models/flow.js'
import * as runModel from '../../models/flow-run.js'
import * as messageModel from '../../models/message.js'
import * as handling from '../handling.js'
import * as engine from './engine.js'
import { flowGraphSchema } from './graph-schema.js'
import { containsAnyKeyword, isOptOutMessage } from './text.js'

// What an inbound WhatsApp message does to automation (research §4, §6, §9).

export const AGENT_DEBOUNCE_MS = 4_000

export interface InboundEvent {
  conversation: Pick<ConversationRow, 'id' | 'handlingMode'>
  contact: Pick<ContactRow, 'id' | 'automationOptOutAt'>
  message: Pick<MessageRow, 'id' | 'direction' | 'type' | 'body'>
}

async function matches(ctx: AppContext, flow: flowModel.FlowWithVersion, event: InboundEvent): Promise<boolean> {
  const trigger = flowGraphSchema.parse(flow.graph).nodes.find((n) => n.type === 'trigger.message_received')
  if (trigger?.type !== 'trigger.message_received') return false
  const { match, keywords } = trigger.config
  if (match === 'any') return true
  if (match === 'keyword') return event.message.type === 'text' && containsAnyKeyword(event.message.body ?? '', keywords ?? [])
  return !(await messageModel.hasOtherInbound(ctx.db, event.conversation.id, event.message.id))
}

/** Resumes the run waiting on this conversation, or reports that another block holds it. */
async function continueActiveRun(ctx: AppContext, run: runModel.RunWithContext): Promise<void> {
  const state = (run.state ?? {}) as Record<string, unknown>
  if (run.status !== 'waiting' || state.awaitingReply !== true) return
  if (state.debounceReplies === true) {
    // Agent: wait a moment for the rest of a burst of messages, then answer them together (FR-020).
    await runModel.update(ctx.db, run.id, { resumeAt: new Date(Date.now() + AGENT_DEBOUNCE_MS) })
    return
  }
  await engine.resume(ctx, run.id, { reply: true })
}

async function startMatchingFlow(ctx: AppContext, event: InboundEvent): Promise<void> {
  for (const flow of await flowModel.listActiveByTrigger(ctx.db, 'message_received')) {
    if (!(await matches(ctx, flow, event))) continue
    const { done } = await engine.start(ctx, { flow, conversationId: event.conversation.id, origin: 'message_received', userId: null })
    await done
    return
  }
}

/** Called by messages.receive for each new inbound message; never throws into the webhook. */
export async function onInboundMessage(ctx: AppContext, event: InboundEvent): Promise<void> {
  if (event.message.direction !== 'inbound') return
  if (event.message.type === 'text' && isOptOutMessage(event.message.body ?? '')) {
    await handling.setOptOut(ctx, null, event.contact.id)
    return
  }
  if (event.contact.automationOptOutAt || event.conversation.handlingMode === 'human') return

  const active = await runModel.findActiveByConversation(ctx.db, event.conversation.id)
  if (active) return continueActiveRun(ctx, active)
  try {
    await startMatchingFlow(ctx, event)
  } catch (error) {
    // Lost the race for the conversation to another trigger: that run answers this message.
    if ((error as { code?: string }).code !== 'RUN_ALREADY_ACTIVE') throw error
  }
}
