import { DomainError } from '../../../lib/errors.js'
import { type AutomatedContent, sendAutomated } from '../../messages.js'
import { renderTemplate } from '../variables.js'
import type { NodeExecutor, NodeInput, NodeResult } from './types.js'

export const SEND_FAILED_REASON = 'Falha ao enviar mensagem automática'
const SEND_FAILED = 'Não foi possível enviar a mensagem pelo WhatsApp.'

/**
 * A failed send never retries by itself: the run fails and a human takes over, so the contact is
 * not left talking to a broken flow (edge case "número desconectado").
 */
async function send(ctx: Parameters<NodeExecutor<'send_text'>>[0], input: NodeInput, content: AutomatedContent): Promise<NodeResult> {
  try {
    const message = await sendAutomated(ctx, input.run.conversationId, content, { flowRunId: input.run.id })
    if (message.status === 'failed') {
      return { handOff: { reason: SEND_FAILED_REASON }, error: message.error ?? SEND_FAILED, output: { messageId: message.id } }
    }
    return { next: 'next', output: { messageId: message.id } }
  } catch (error) {
    if (error instanceof DomainError) return { handOff: { reason: SEND_FAILED_REASON }, error: error.message }
    throw error
  }
}

export const sendText: NodeExecutor<'send_text'> = (ctx, node, input) =>
  send(ctx, input, { text: renderTemplate(node.config.text, input.conversation.contact) })

export const sendMedia: NodeExecutor<'send_media'> = (ctx, node, input) =>
  send(ctx, input, {
    media: {
      mediaPath: node.config.mediaPath,
      mime: node.config.mime,
      filename: node.config.filename,
      caption: node.config.caption ? renderTemplate(node.config.caption, input.conversation.contact) : undefined,
    },
  })
