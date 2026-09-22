import { Readable } from 'node:stream'
import type { ReadableStream } from 'node:stream/web'
import { DomainError } from '../../lib/errors.js'
import { QUERY_TIMEOUT_MS } from '../../models/bi/limits.js'
import { readCsv } from './csv.js'
import { guardedFetch, type FetchGuardOptions } from './network-guard.js'

const SHEET_PATH = /^\/spreadsheets\/d\/([A-Za-z0-9_-]+)/
const DEFAULT_GID = '0'

const notAGoogleSheet = () =>
  new DomainError('VALIDATION_ERROR', 'Use o link de uma planilha do Google Planilhas.', 422)

const notShared = () =>
  new DomainError(
    'AUTH_FAILED',
    'A planilha não está compartilhada por link. Em Compartilhar, escolha "Qualquer pessoa com o link".',
    422,
  )

/** Any sheet link (…/edit#gid=123, …/edit?gid=123) → the CSV export of that tab. */
export function toCsvExportUrl(url: string, gid?: string): string {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw notAGoogleSheet()
  }
  const id = SHEET_PATH.exec(parsed.pathname)?.[1]
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'docs.google.com' || !id) throw notAGoogleSheet()
  const tab = gid ?? new URLSearchParams(parsed.hash.slice(1)).get('gid') ?? parsed.searchParams.get('gid') ?? DEFAULT_GID
  return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${encodeURIComponent(tab)}`
}

export async function* readGoogleSheet(
  config: { url: string; gid?: string; headerRow: number },
  opts: FetchGuardOptions,
): AsyncGenerator<Record<string, string>> {
  const url = toCsvExportUrl(config.url, config.gid)
  const response = await guardedFetch(url, { signal: AbortSignal.timeout(QUERY_TIMEOUT_MS) }, opts)
  // A private sheet redirects to Google's login page, which answers 200 with HTML.
  const isHtml = response.headers.get('content-type')?.includes('text/html') ?? false
  if (response.status === 401 || response.status === 403 || isHtml) throw notShared()
  if (!response.ok || !response.body) {
    throw new DomainError('CONNECTION_FAILED', `O Google Planilhas respondeu com erro (HTTP ${response.status}).`, 422)
  }
  yield* readCsv(Readable.fromWeb(response.body as ReadableStream), { headerRow: config.headerRow })
}
