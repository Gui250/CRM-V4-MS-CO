import { z } from 'zod'
import { type AiProviderClient, type GenerateResult, parseToolArgs, requestJson } from './index.js'

const BASE_URL = 'https://api.openai.com/v1'

const modelsResponse = z.object({ data: z.array(z.object({ id: z.string() })) })

// Other item types (reasoning, …) are ignored, so one loose shape is enough.
const outputItem = z.looseObject({
  type: z.string(),
  content: z.array(z.looseObject({ type: z.string(), text: z.string().optional() })).optional(),
  name: z.string().optional(),
  arguments: z.string().optional(),
})
const responsesResponse = z.object({ output: z.array(outputItem) })

function parseOutput(output: z.infer<typeof outputItem>[]): GenerateResult {
  const texts = output
    .filter((item) => item.type === 'message')
    .flatMap((item) => item.content ?? [])
    .flatMap((part) => (part.type === 'output_text' && part.text ? [part.text] : []))
  const toolCalls = output.flatMap((item) =>
    item.type === 'function_call' && item.name ? [{ name: item.name, args: parseToolArgs(item.arguments) }] : [],
  )
  return { text: texts.join('\n').trim(), toolCalls }
}

const headers = (apiKey: string) => ({ Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' })

export function createOpenAiClient(doFetch: typeof fetch = fetch): AiProviderClient {
  return {
    async listModels(apiKey, signal) {
      const result = await requestJson(doFetch, `${BASE_URL}/models`, { headers: headers(apiKey), signal }, modelsResponse)
      return result.data.map((m) => m.id).sort()
    },

    async generate({ apiKey, model, system, turns, tools, signal }) {
      const body = {
        model,
        instructions: system,
        input: turns.map((t) => ({ role: t.role, content: t.text })),
        tools: tools.map((t) => ({ type: 'function', name: t.name, description: t.description, parameters: t.parameters, strict: true })),
        // Customer conversations must not be retained by the provider for later retrieval.
        store: false,
      }
      const result = await requestJson(
        doFetch,
        `${BASE_URL}/responses`,
        { method: 'POST', headers: headers(apiKey), body: JSON.stringify(body), signal },
        responsesResponse,
      )
      return parseOutput(result.output)
    },
  }
}
