import type { NodeType } from '../graph-schema.js'
import { aiAgent } from './ai-agent.js'
import { condition } from './condition.js'
import { end, handoff, trigger, wait, waitReply } from './flow-control.js'
import { sendMedia, sendText } from './send.js'
import type { NodeExecutor } from './types.js'

type Registry = { [T in NodeType]: NodeExecutor<T> }

/** One executor per block type. */
export const executors: Registry = {
  'trigger.message_received': trigger,
  'trigger.manual': trigger,
  send_text: sendText,
  send_media: sendMedia,
  wait,
  wait_reply: waitReply,
  condition,
  ai_agent: aiAgent,
  handoff,
  end,
}
