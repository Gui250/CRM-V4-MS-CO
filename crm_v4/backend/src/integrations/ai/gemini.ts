import { z } from 'zod'
import { type AiProviderClient, aiError, type GenerateInput, normalizeTurns, parseToolArgs, requestJson } from './index.js'

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta'
const MODEL_PREFIX = 'models/'
const MAX_PAGE_SIZE = 1000

const modelsResponse = z.object({
  models: z.array(z.object({ name: z.string(), supportedGenerationMethods: z.array(z.string()).optional() })).default([]),
})

const part = z.looseObject({
  text: z.string().optional(),
  functionCall: z.object({ name: z.string(), args: z.unknown().optional() }).optional(),
})
const generateResponse = z.object({
  candidates: z.array(z.looseObject({ content: z.looseObject({ parts: z.array(part).default([]) }).optional() })).optional(),
})

const headers = (apiKey: string) => ({ 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' })

function buildRequest({ system, turns, tools }: Pick<GenerateInput, 'system' | 'turns' | 'tools'>) {
  return {
    systemInstruction: { parts: [{ text: system }] },
    contents: normalizeTurns(turns).map((t) => ({ role: t.role === 'assistant' ? 'model' : 'user', parts: [{ text: t.text }] })),
    // Gemini takes an OpenAPI subset: no additionalProperties.
    tools: [
      {
        functionDeclarations: tools.map((t) => ({
          name: t.name,
          description: t.description,
          parameters: { type: 'object', properties: t.parameters.properties, required: t.parameters.required },
        })),
      },
    ],
  }
}

export function createGeminiClient(doFetch: typeof fetch = fetch): AiProviderClient {
  return {
    async listModels(apiKey, signal) {
      const result = await requestJson(
        doFetch,
        `${BASE_URL}/models?pageSize=${MAX_PAGE_SIZE}`,
        { headers: headers(apiKey), signal },
        modelsResponse,
      )
      return result.models
        .filter((m) => m.supportedGenerationMethods?.includes('generateContent') ?? true)
        .map((m) => m.name.replace(MODEL_PREFIX, ''))
        .sort()
    },

    async generate({ apiKey, model, system, turns, tools, signal }) {
      const body = buildRequest({ system, turns, tools })
      const result = await requestJson(
        doFetch,
        `${BASE_URL}/models/${encodeURIComponent(model)}:generateContent`,
        { method: 'POST', headers: headers(apiKey), body: JSON.stringify(body), signal },
        generateResponse,
      )
      const parts = result.candidates?.[0]?.content?.parts
      if (!parts) throw aiError('resposta bloqueada ou vazia')
      return {
        text: parts
          .map((p) => p.text ?? '')
          .join('')
          .trim(),
        toolCalls: parts.flatMap((p) => (p.functionCall ? [{ name: p.functionCall.name, args: parseToolArgs(p.functionCall.args) }] : [])),
      }
    },
  }
}
