import type { Readable } from 'node:stream'
import { z } from 'zod'
import { DomainError } from '../../lib/errors.js'
import { MAX_API_PAGES, MAX_QUERY_LENGTH } from '../../models/bi/limits.js'
import { readCsv } from './csv.js'
import { readGoogleSheet } from './google-sheets.js'
import { readApi } from './http-api.js'
import { readMysql } from './mysql.js'
import { readPostgres } from './postgres.js'
import { listSheets, readXlsx } from './xlsx.js'

export const SOURCE_KINDS = ['spreadsheet_file', 'spreadsheet_url', 'postgres', 'mysql', 'api'] as const
export type SourceKind = (typeof SOURCE_KINDS)[number]

const MAX_PORT = 65_535
const HTTP_HEADER_NAME = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/

const headerRow = z.number().int().min(1).default(1)
const headerList = z.array(
  z.object({ name: z.string().regex(HTTP_HEADER_NAME, 'Nome de cabeçalho inválido.'), value: z.string() }),
)

const databaseConfig = z
  .object({
    host: z.string().trim().min(1),
    port: z.number().int().min(1).max(MAX_PORT),
    database: z.string().min(1),
    user: z.string().min(1),
    ssl: z.boolean().default(false),
    mode: z.enum(['table', 'query']),
    table: z.object({ schema: z.string().min(1).optional(), name: z.string().min(1) }).optional(),
    query: z.string().min(1).max(MAX_QUERY_LENGTH).optional(),
  })
  .refine((c) => (c.mode === 'table' ? c.table !== undefined : c.query !== undefined), {
    message: 'Escolha uma tabela ou escreva a consulta.',
    path: ['mode'],
  })

/** `bi_sources.config` per kind (data-model.md). */
export const sourceConfigSchemas = {
  spreadsheet_file: z.object({
    storagePath: z.string().min(1),
    originalFilename: z.string().min(1),
    sheet: z.string().min(1).optional(),
    headerRow,
  }),
  spreadsheet_url: z.object({
    url: z.url({ protocol: /^https$/, hostname: /^docs\.google\.com$/, error: 'Use o link de uma planilha do Google Planilhas.' }),
    gid: z.string().min(1).optional(),
    headerRow,
  }),
  postgres: databaseConfig,
  mysql: databaseConfig,
  api: z.object({
    url: z.url({ protocol: /^https?$/, error: 'Use um endereço http:// ou https://.' }),
    method: z.enum(['GET', 'POST']),
    headers: headerList.default([]),
    query: z.array(z.object({ name: z.string().min(1), value: z.string() })).default([]),
    body: z.string().optional(),
    itemsPath: z.string().min(1).optional(),
    pagination: z
      .object({ param: z.string().min(1), start: z.number().int(), maxPages: z.number().int().min(1).max(MAX_API_PAGES) })
      .optional(),
  }),
} satisfies Record<SourceKind, z.ZodType>

/** The encrypted part (`bi_sources.secrets_encrypted`) per kind. */
export const sourceSecretsSchemas = {
  spreadsheet_file: z.object({}),
  spreadsheet_url: z.object({}),
  postgres: z.object({ password: z.string() }),
  mysql: z.object({ password: z.string() }),
  api: z.object({ headers: headerList.default([]) }),
} satisfies Record<SourceKind, z.ZodType>

export interface BiConnectors {
  read(kind: SourceKind, config: Record<string, unknown>, secrets: Record<string, unknown>): AsyncIterable<Record<string, unknown>>
  listSheets(storagePath: string): Promise<string[]>
}

export interface BiConnectorDeps {
  storage: { get(key: string): Promise<Readable | null> }
  allowPrivateNetworks: boolean
  fetch?: typeof fetch
}

function parse<S extends z.ZodType>(schema: S, value: unknown): z.infer<S> {
  const parsed = schema.safeParse(value)
  if (!parsed.success) throw new DomainError('VALIDATION_ERROR', 'Configuração da fonte inválida.', 422)
  return parsed.data
}

const extension = (filename: string) => filename.toLowerCase().split('.').pop()

export function createBiConnectors(deps: BiConnectorDeps): BiConnectors {
  const guard = { allowPrivate: deps.allowPrivateNetworks, fetch: deps.fetch }

  async function openFile(storagePath: string): Promise<Readable> {
    const stream = await deps.storage.get(storagePath)
    if (!stream) throw new DomainError('NOT_FOUND', 'Arquivo da planilha não encontrado.', 404)
    return stream
  }

  async function* readFile(raw: unknown): AsyncGenerator<Record<string, unknown>> {
    const config = parse(sourceConfigSchemas.spreadsheet_file, raw)
    const format = extension(config.originalFilename)
    if (format !== 'csv' && format !== 'xlsx') {
      throw new DomainError('VALIDATION_ERROR', 'Formato de planilha não suportado. Use .csv ou .xlsx.', 422)
    }
    const stream = await openFile(config.storagePath)
    yield* format === 'csv' ? readCsv(stream, config) : readXlsx(stream, config)
  }

  return {
    // Errors (validation included) surface on iteration, like every reader.
    async *read(kind, config, secrets) {
      switch (kind) {
        case 'spreadsheet_file':
          return yield* readFile(config)
        case 'spreadsheet_url':
          return yield* readGoogleSheet(parse(sourceConfigSchemas.spreadsheet_url, config), guard)
        case 'postgres':
          return yield* readPostgres(parse(sourceConfigSchemas.postgres, config), parse(sourceSecretsSchemas.postgres, secrets), guard)
        case 'mysql':
          return yield* readMysql(parse(sourceConfigSchemas.mysql, config), parse(sourceSecretsSchemas.mysql, secrets), guard)
        case 'api':
          return yield* readApi(parse(sourceConfigSchemas.api, config), parse(sourceSecretsSchemas.api, secrets), guard)
      }
    },
    async listSheets(storagePath) {
      return listSheets(await openFile(storagePath))
    },
  }
}
