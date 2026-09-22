// Form state of a source and its translation to the API `config`/`secrets` (data-model.md § bi_sources).
import type { RefreshInterval, Source } from '@/lib/bi/types'
import type { ExternalKind, Upload } from '../sources/use-source-admin'

export type Pair = { name: string; value: string }
/** `masked` marks a secret header already saved (value left blank keeps it). */
export type HeaderRow = Pair & { secret: boolean; masked?: string }

export type Draft = {
  name: string
  refreshInterval: RefreshInterval
  // spreadsheets
  upload: Upload | null
  sheet: string
  url: string
  gid: string
  headerRow: string
  // databases
  host: string
  port: string
  database: string
  user: string
  password: string
  maskedPassword: string
  ssl: boolean
  mode: 'table' | 'query'
  schema: string
  table: string
  query: string
  // api (shares `url`)
  method: 'GET' | 'POST'
  headers: HeaderRow[]
  queryParams: Pair[]
  body: string
  itemsPath: string
  paginate: boolean
  pageParam: string
  pageStart: string
  maxPages: string
}

export type Errors = Partial<Record<keyof Draft, string>>

export const MAX_API_PAGES = 50
const DEFAULT_PORT: Partial<Record<ExternalKind, string>> = { postgres: '5432', mysql: '3306' }

export function emptyDraft(kind: ExternalKind): Draft {
  return {
    name: '',
    refreshInterval: 'manual',
    upload: null,
    sheet: '',
    url: '',
    gid: '',
    headerRow: '1',
    host: '',
    port: DEFAULT_PORT[kind] ?? '',
    database: '',
    user: '',
    password: '',
    maskedPassword: '',
    ssl: false,
    mode: 'table',
    schema: '',
    table: '',
    query: '',
    method: 'GET',
    headers: [],
    queryParams: [],
    body: '',
    itemsPath: '',
    paginate: false,
    pageParam: 'page',
    pageStart: '1',
    maxPages: '10',
  }
}

const str = (value: unknown) => (typeof value === 'string' ? value : typeof value === 'number' ? String(value) : '')
const pairs = (value: unknown): Pair[] => (Array.isArray(value) ? (value as Pair[]).map((p) => ({ name: str(p.name), value: str(p.value) })) : [])

export function draftFromSource(source: Source): Draft {
  const kind = source.kind as ExternalKind
  const c = source.config ?? {}
  const masked = source.maskedSecrets ?? {}
  const table = (c.table ?? {}) as { schema?: string; name?: string }
  const pagination = c.pagination as { param: string; start: number; maxPages: number } | undefined
  const base = emptyDraft(kind)
  return {
    ...base,
    name: source.name,
    refreshInterval: source.refreshInterval,
    upload: kind === 'spreadsheet_file' ? { storagePath: str(c.storagePath), originalFilename: str(c.originalFilename), sheets: [] } : null,
    sheet: str(c.sheet),
    url: str(c.url),
    gid: str(c.gid),
    headerRow: str(c.headerRow) || '1',
    host: str(c.host),
    port: str(c.port) || base.port,
    database: str(c.database),
    user: str(c.user),
    maskedPassword: str(masked.password),
    ssl: c.ssl === true,
    mode: c.mode === 'query' ? 'query' : 'table',
    schema: str(table.schema),
    table: str(table.name),
    query: kind === 'api' ? '' : str(c.query),
    method: c.method === 'POST' ? 'POST' : 'GET',
    headers: [
      ...pairs(c.headers).map((h) => ({ ...h, secret: false })),
      ...pairs(masked.headers).map((h) => ({ name: h.name, value: '', secret: true, masked: h.value })),
    ],
    queryParams: kind === 'api' ? pairs(c.query) : [],
    body: str(c.body),
    itemsPath: str(c.itemsPath),
    paginate: Boolean(pagination),
    pageParam: pagination?.param ?? base.pageParam,
    pageStart: pagination ? String(pagination.start) : base.pageStart,
    maxPages: pagination ? String(pagination.maxPages) : base.maxPages,
  }
}

const int = (value: string) => Number.parseInt(value, 10)
const named = <T extends Pair>(rows: T[]) => rows.filter((row) => row.name.trim())

function buildApiInput(d: Draft, editing: boolean) {
  const secretRows = named(d.headers.filter((h) => h.secret))
  const unchanged =
    secretRows.every((h) => h.masked !== undefined && !h.value) &&
    secretRows.length === d.headers.filter((h) => h.masked !== undefined).length
  return {
    config: {
      url: d.url.trim(),
      method: d.method,
      headers: named(d.headers.filter((h) => !h.secret)).map(({ name, value }) => ({ name: name.trim(), value })),
      query: named(d.queryParams).map(({ name, value }) => ({ name: name.trim(), value })),
      ...(d.method === 'POST' && d.body.trim() ? { body: d.body } : {}),
      ...(d.itemsPath.trim() ? { itemsPath: d.itemsPath.trim() } : {}),
      ...(d.paginate ? { pagination: { param: d.pageParam.trim(), start: int(d.pageStart), maxPages: int(d.maxPages) } } : {}),
    },
    ...(editing && unchanged ? {} : { secrets: { headers: secretRows.map(({ name, value }) => ({ name: name.trim(), value })) } }),
  }
}

/** API body parts. `editing`: blank secrets are omitted (or sent blank per header) so the saved ones are kept. */
export function buildInput(kind: ExternalKind, d: Draft, editing = false): { config: Record<string, unknown>; secrets?: Record<string, unknown> } {
  switch (kind) {
    case 'spreadsheet_file':
      return {
        config: {
          storagePath: d.upload?.storagePath ?? '',
          originalFilename: d.upload?.originalFilename ?? '',
          ...(d.sheet ? { sheet: d.sheet } : {}),
          headerRow: int(d.headerRow),
        },
      }
    case 'spreadsheet_url':
      return { config: { url: d.url.trim(), ...(d.gid.trim() ? { gid: d.gid.trim() } : {}), headerRow: int(d.headerRow) } }
    case 'postgres':
    case 'mysql':
      return {
        config: {
          host: d.host.trim(),
          port: int(d.port),
          database: d.database.trim(),
          user: d.user.trim(),
          ssl: d.ssl,
          mode: d.mode,
          ...(d.mode === 'table'
            ? { table: { ...(d.schema.trim() ? { schema: d.schema.trim() } : {}), name: d.table.trim() } }
            : { query: d.query.trim() }),
        },
        ...(editing && !d.password ? {} : { secrets: { password: d.password } }),
      }
    case 'api':
      return buildApiInput(d, editing)
  }
}

const REQUIRED = 'Campo obrigatório.'

/** Client-side checks before calling the server; the server still validates everything. */
export function validateDraft(kind: ExternalKind, d: Draft, editing = false): Errors {
  const errors: Errors = {}
  const need = (key: keyof Draft, ok: boolean, message = REQUIRED) => {
    if (!ok) errors[key] = message
  }
  const positive = (value: string) => Number.isInteger(Number(value)) && Number(value) >= 1
  switch (kind) {
    case 'spreadsheet_file':
      need('upload', Boolean(d.upload?.storagePath), 'Envie uma planilha .csv ou .xlsx.')
      need('headerRow', positive(d.headerRow), 'Informe um número a partir de 1.')
      break
    case 'spreadsheet_url':
      need('url', d.url.trim().startsWith('https://docs.google.com/'), 'Use o link de uma planilha do Google Planilhas.')
      need('headerRow', positive(d.headerRow), 'Informe um número a partir de 1.')
      break
    case 'postgres':
    case 'mysql':
      need('host', Boolean(d.host.trim()))
      need('port', positive(d.port) && Number(d.port) <= 65535, 'Porta inválida.')
      need('database', Boolean(d.database.trim()))
      need('user', Boolean(d.user.trim()))
      need('password', editing || Boolean(d.password))
      if (d.mode === 'table') need('table', Boolean(d.table.trim()))
      else need('query', Boolean(d.query.trim()))
      break
    case 'api':
      need('url', /^https?:\/\/\S+$/.test(d.url.trim()), 'Use um endereço http:// ou https://.')
      if (d.paginate) {
        need('pageParam', Boolean(d.pageParam.trim()))
        need('pageStart', Number.isInteger(Number(d.pageStart)) && d.pageStart.trim() !== '', 'Informe um número inteiro.')
        need('maxPages', positive(d.maxPages) && Number(d.maxPages) <= MAX_API_PAGES, `De 1 a ${MAX_API_PAGES} páginas.`)
      }
      break
  }
  return errors
}
