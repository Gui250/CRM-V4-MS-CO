import * as messageModel from '../../../models/message.js'
import type { NodeOfType } from '../graph-schema.js'
import { normalizeText } from '../text.js'
import type { NodeExecutor } from './types.js'

export interface ConditionFacts {
  /** Text of the latest inbound message; null when it was media or there is none. */
  lastMessage: string | null
  contactName: string | null
  contactPhone: string
}

type ConditionConfig = NodeOfType<'condition'>['config']

function sourceValue(source: ConditionConfig['source'], facts: ConditionFacts): string {
  if (source === 'last_message') return facts.lastMessage ?? ''
  if (source === 'contact_name') return facts.contactName ?? ''
  return facts.contactPhone
}

/** Case- and accent-insensitive comparison (contracts/flow-graph.md). Returns the output handle. */
export function evaluateCondition(config: ConditionConfig, facts: ConditionFacts): 'yes' | 'no' {
  const actual = normalizeText(sourceValue(config.source, facts))
  const expected = normalizeText(config.value)
  const matches = {
    contains: () => actual.includes(expected),
    equals: () => actual === expected,
    starts_with: () => actual.startsWith(expected),
    is_empty: () => actual === '',
  }[config.operator]()
  return matches ? 'yes' : 'no'
}

/** The latest inbound text decides; media counts as empty. */
export const condition: NodeExecutor<'condition'> = async (ctx, node, { conversation }) => {
  const latest = await messageModel.latestInbound(ctx.db, conversation.id)
  const facts: ConditionFacts = {
    lastMessage: latest?.type === 'text' ? latest.body : null,
    contactName: conversation.contact.name,
    contactPhone: conversation.contact.phone,
  }
  const handle = evaluateCondition(node.config, facts)
  return { next: handle, output: { handle, value: sourceValue(node.config.source, facts) } }
}
