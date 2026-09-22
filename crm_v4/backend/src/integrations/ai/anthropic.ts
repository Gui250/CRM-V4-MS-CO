import Anthropic from '@anthropic-ai/sdk'
import { type AiProviderClient, aiError, normalizeTurns, parseToolArgs } from './index.js'

// WhatsApp replies are short; this caps cost if a model rambles.
const MAX_TOKENS = 1024

type Client = Pick<Anthropic, 'messages' | 'models'>

function toAiError(error: unknown): Error {
  if (error instanceof Anthropic.APIUserAbortError || error instanceof Anthropic.APIConnectionTimeoutError) return aiError('tempo esgotado')
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
    return aiError('chave inválida ou sem permissão')
  }
  if (error instanceof Anthropic.RateLimitError) return aiError('limite de uso atingido')
  if (error instanceof Anthropic.APIConnectionError) return aiError('sem resposta')
  if (error instanceof Anthropic.APIError) return aiError(`HTTP ${error.status ?? 'desconhecido'}`)
  if (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')) return aiError('tempo esgotado')
  return aiError('resposta inválida')
}

async function guarded<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call()
  } catch (error) {
    throw toAiError(error)
  }
}

/** Official SDK (research §5). maxRetries 0: the flow engine owns retries and the 30 s budget. */
export function createAnthropicClient(makeClient: (apiKey: string) => Client = (apiKey) => new Anthropic({ apiKey, maxRetries: 0 })): AiProviderClient {
  return {
    listModels(apiKey, signal) {
      return guarded(async () => {
        const ids: string[] = []
        for await (const model of makeClient(apiKey).models.list({ limit: 1000 }, { signal })) ids.push(model.id)
        return ids.sort()
      })
    },

    async generate({ apiKey, model, system, turns, tools, signal }) {
      const response = await guarded(() =>
        makeClient(apiKey).messages.create(
          {
            model,
            max_tokens: MAX_TOKENS,
            system,
            messages: normalizeTurns(turns).map((t) => ({ role: t.role, content: t.text })),
            tools: tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters })),
          },
          { signal },
        ),
      )
      if (response.stop_reason === 'refusal') throw aiError('o modelo recusou responder')
      const text = response.content
        .flatMap((block) => (block.type === 'text' ? [block.text] : []))
        .join('\n')
        .trim()
      const toolCalls = response.content.flatMap((block) =>
        block.type === 'tool_use' ? [{ name: block.name, args: parseToolArgs(block.input) }] : [],
      )
      return { text, toolCalls }
    },
  }
}
