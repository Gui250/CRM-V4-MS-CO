import { DomainError } from '../../lib/errors.js'
import { MAX_API_PAGE_BYTES, MAX_API_PAGES, QUERY_TIMEOUT_MS } from '../../models/bi/limits.js'
import { guardedFetch, type FetchGuardOptions } from './network-guard.js'
import { countRow } from './rows.js'

export interface NameValue {
  name: string
  value: string
}

export interface ApiConfig {
  url: string
  method: 'GET' | 'POST'
  headers: NameValue[]
  query: NameValue[]
  body?: string
  itemsPath?: string
  pagination?: { param: string; start: number; maxPages: number }
}

type Row = Record<string, unknown>

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const tooLarge = () => new DomainError('TOO_LARGE', 'A resposta da API passou de 20 MB.', 422)
const notJson = () => new DomainError('CONNECTION_FAILED', 'A API não respondeu em JSON.', 422)

function pageUrl(config: ApiConfig, page: number): string {
  const url = new URL(config.url)
  for (const { name, value } of config.query) url.searchParams.append(name, value)
  if (config.pagination) url.searchParams.set(config.pagination.param, String(config.pagination.start + page))
  return url.toString()
}

function requestInit(config: ApiConfig, secretHeaders: NameValue[]): RequestInit {
  const headers = new Headers({ Accept: 'application/json' })
  for (const { name, value } of [...config.headers, ...secretHeaders]) headers.set(name, value)
  const body = config.method === 'POST' ? config.body : undefined
  if (body !== undefined && !headers.has('content-type')) headers.set('Content-Type', 'application/json')
  return { method: config.method, headers, body, signal: AbortSignal.timeout(QUERY_TIMEOUT_MS) }
}

/** Reads at most `MAX_API_PAGE_BYTES`, cancelling the download as soon as it passes. */
async function readCapped(response: Response): Promise<string> {
  if (Number(response.headers.get('content-length')) > MAX_API_PAGE_BYTES) {
    await response.body?.cancel()
    throw tooLarge()
  }
  const chunks: Uint8Array[] = []
  let size = 0
  for await (const chunk of response.body ?? []) {
    size += chunk.byteLength
    if (size > MAX_API_PAGE_BYTES) throw tooLarge() // leaving the loop cancels the stream
    chunks.push(chunk)
  }
  return Buffer.concat(chunks).toString('utf8')
}

function mapFetchError(error: unknown): unknown {
  if (error instanceof DomainError) return error
  if (error instanceof Error && error.name === 'TimeoutError') {
    return new DomainError('TIMEOUT', 'A API passou de 30 segundos sem responder.', 422)
  }
  return new DomainError('CONNECTION_FAILED', 'Não foi possível conectar à API. Verifique o endereço.', 422)
}

async function fetchPage(url: string, init: RequestInit, opts: FetchGuardOptions): Promise<unknown> {
  try {
    const response = await guardedFetch(url, init, opts)
    if (response.status === 401 || response.status === 403) {
      throw new DomainError('AUTH_FAILED', `A API recusou o acesso (HTTP ${response.status}). Confira os cabeçalhos de autenticação.`, 422)
    }
    if (!response.ok) throw new DomainError('CONNECTION_FAILED', `A API respondeu com erro (HTTP ${response.status}).`, 422)
    const text = await readCapped(response)
    try {
      return JSON.parse(text)
    } catch {
      throw notJson()
    }
  } catch (error) {
    throw mapFetchError(error)
  }
}

/** The list of items: at `itemsPath`, else the body array, the first array property or the body itself. */
export function extractItems(body: unknown, itemsPath?: string): unknown[] {
  if (itemsPath) {
    const value = itemsPath.split('.').reduce<unknown>((node, key) => (isObject(node) ? node[key] : undefined), body)
    if (value === undefined) {
      throw new DomainError('ITEMS_PATH_NOT_FOUND', `Não encontrei a lista de itens em "${itemsPath}".`, 422)
    }
    return Array.isArray(value) ? value : [value]
  }
  if (Array.isArray(body)) return body
  if (isObject(body)) return Object.values(body).find(Array.isArray) ?? [body]
  return []
}

/** `{ a: { b: 1 }, tags: [1] }` → `{ 'a.b': 1, tags: '[1]' }`; a bare value becomes `{ valor }`. */
export function flatten(item: unknown, prefix = '', out: Row = {}): Row {
  if (!isObject(item)) return { valor: Array.isArray(item) ? JSON.stringify(item) : item }
  for (const [key, value] of Object.entries(item)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (isObject(value)) flatten(value, path, out)
    else out[path] = Array.isArray(value) ? JSON.stringify(value) : value
  }
  return out
}

export async function* readApi(
  config: ApiConfig,
  secrets: { headers?: NameValue[] },
  opts: FetchGuardOptions,
): AsyncGenerator<Row> {
  const pages = config.pagination ? Math.min(config.pagination.maxPages, MAX_API_PAGES) : 1
  let count = 0
  for (let page = 0; page < pages; page++) {
    const body = await fetchPage(pageUrl(config, page), requestInit(config, secrets.headers ?? []), opts)
    const items = extractItems(body, config.itemsPath)
    if (items.length === 0) return
    for (const item of items) {
      count = countRow(count, 'A API')
      yield flatten(item)
    }
  }
}
