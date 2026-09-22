import type { z } from 'zod'
import { DomainError } from '../../lib/errors.js'

export type AiVendor = 'openai' | 'anthropic' | 'gemini'

/** Hard limit for any provider call (FR-019). */
export const PROVIDER_TIMEOUT_MS = 30_000

export interface ChatTurn {
  role: 'user' | 'assistant'
  text: string
}

export interface ToolDefinition {
  name: string
  description: string
  /** JSON Schema of the arguments: object with `properties`, `required`, `additionalProperties: false`. */
  parameters: { type: 'object'; properties: Record<string, object>; required: string[]; additionalProperties: false }
}

export interface ToolCall {
  name: string
  args: Record<string, unknown>
}

export interface GenerateInput {
  apiKey: string
  model: string
  system: string
  turns: ChatTurn[]
  tools: ToolDefinition[]
  signal: AbortSignal
}

export interface GenerateResult {
  text: string
  toolCalls: ToolCall[]
}

/** One module per vendor implements this (research §5). */
export interface AiProviderClient {
  generate(input: GenerateInput): Promise<GenerateResult>
  /** Lists model ids; also the connection test (costs no tokens). */
  listModels(apiKey: string, signal?: AbortSignal): Promise<string[]>
}

export type AiRegistry = Record<AiVendor, AiProviderClient>

/** Never include request details: they could carry the API key. */
export const aiError = (detail: string) =>
  new DomainError('AI_PROVIDER_ERROR', `O provedor de IA não respondeu corretamente (${detail}).`, 502)

const detailForStatus = (status: number) =>
  status === 401 || status === 403 ? 'chave inválida ou sem permissão' : status === 429 ? 'limite de uso atingido' : `HTTP ${status}`

/** fetch + status check + Zod parse; every failure becomes AI_PROVIDER_ERROR. */
export async function requestJson<S extends z.ZodType>(
  doFetch: typeof fetch,
  url: string,
  init: RequestInit,
  schema: S,
): Promise<z.infer<S>> {
  let response: Response
  try {
    response = await doFetch(url, init)
  } catch (error) {
    throw aiError(error instanceof Error && error.name === 'TimeoutError' ? 'tempo esgotado' : 'sem resposta')
  }
  if (!response.ok) throw aiError(detailForStatus(response.status))
  const parsed = schema.safeParse(await response.json().catch(() => undefined))
  if (!parsed.success) throw aiError('resposta inválida')
  return parsed.data
}

const CONVERSATION_START = '(início da conversa)'

/**
 * Merges consecutive turns of the same role and makes the history start with the user, which
 * strict providers require. WhatsApp histories break both rules often (automation greets first,
 * contacts send several messages in a row).
 */
export function normalizeTurns(turns: ChatTurn[]): ChatTurn[] {
  const merged: ChatTurn[] = []
  for (const turn of turns) {
    const last = merged.at(-1)
    if (last?.role === turn.role) last.text = `${last.text}\n${turn.text}`
    else merged.push({ ...turn })
  }
  if (merged[0]?.role === 'assistant') merged.unshift({ role: 'user', text: CONVERSATION_START })
  return merged
}

export function parseToolArgs(raw: unknown): Record<string, unknown> {
  if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) return raw as Record<string, unknown>
  if (typeof raw !== 'string') return {}
  try {
    const value: unknown = JSON.parse(raw)
    return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}
