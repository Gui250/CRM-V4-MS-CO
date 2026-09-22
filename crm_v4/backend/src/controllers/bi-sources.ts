import { randomUUID } from 'node:crypto'
import type { AppContext } from '../context.js'
import type { BiSourceRow } from '../db/schema-bi.js'
import { sourceConfigSchemas, sourceSecretsSchemas, type SourceKind } from '../integrations/bi-connectors/index.js'
import { encryptSecrets, maskSecret } from '../lib/crypto.js'
import { conflict, DomainError, forbidden } from '../lib/errors.js'
import { datasetFor } from '../models/bi/dataset.js'
import type { FieldType, SourceField } from '../models/bi/definition.js'
import { listInternalSources } from '../models/bi/internal-sources.js'
import { MAX_SPREADSHEET_BYTES, PREVIEW_ROWS, TYPE_SAMPLE_ROWS } from '../models/bi/limits.js'
import * as relationships from '../models/bi/relationship.js'
import { reportsUsingSource } from '../models/bi/report.js'
import * as sources from '../models/bi/source.js'
import { buildFields, type FieldOverrides } from '../models/bi/type-inference.js'
import type { User } from '../models/user.js'
import { toInternalSourceDto, toRelationshipDto, toSourceDto } from './bi-dto.js'
import { keysOf, RowNormalizer, sourceSecrets, startRefresh } from './bi-ingest.js'
import { withDetails } from './bi-reports.js'

type Secrets = Record<string, unknown>
type Header = { name: string; value: string }

export type SourceInput = {
  name: string
  kind: SourceKind
  config: Record<string, unknown>
  secrets?: Secrets
  refreshInterval?: sources.RefreshInterval
  /** Corrections made in the preview; applied by the first capture. */
  fieldTypes?: Record<string, FieldType>
  fieldLabels?: Record<string, string>
}

const sourceNotFound = () => new DomainError('SOURCE_NOT_FOUND', 'Fonte de dados não encontrada.', 404)

function assertAdmin(user: User) {
  if (user.role !== 'admin') throw forbidden('Apenas administradores gerenciam fontes de dados.')
}

function validated(kind: SourceKind, config: unknown, secrets: unknown) {
  const configResult = sourceConfigSchemas[kind].safeParse(config)
  const secretsResult = sourceSecretsSchemas[kind].safeParse(secrets ?? {})
  if (!configResult.success || !secretsResult.success) {
    const issue = (configResult.error ?? secretsResult.error)!.issues[0]
    throw new DomainError('VALIDATION_ERROR', `Configuração inválida em "${issue?.path.join('.')}": ${issue?.message}`, 422)
  }
  return { config: configResult.data as Record<string, unknown>, secrets: secretsResult.data as Secrets }
}

function validateInterval(kind: SourceKind, interval: sources.RefreshInterval) {
  if (kind === 'spreadsheet_file' && interval !== 'manual') {
    throw new DomainError('VALIDATION_ERROR', 'Planilhas enviadas por arquivo só podem ser atualizadas manualmente.', 422)
  }
}

/** Empty values mean "keep what is saved": password fields left blank, secret headers without value. */
export function mergeSecrets(saved: Secrets, incoming: Secrets): Secrets {
  const merged: Secrets = { ...saved }
  for (const [key, value] of Object.entries(incoming)) {
    if (value === '' || value === undefined) continue
    if (key === 'headers' && Array.isArray(value)) {
      const before = (saved.headers as Header[] | undefined) ?? []
      merged.headers = (value as Header[]).map((header) =>
        header.value ? header : { ...header, value: before.find((old) => old.name === header.name)?.value ?? '' },
      )
      continue
    }
    merged[key] = value
  }
  return merged
}

export function maskSecrets(secrets: Secrets): Secrets {
  const masked: Secrets = {}
  for (const [key, value] of Object.entries(secrets)) {
    if (typeof value === 'string') masked[key] = maskSecret(value)
    else if (key === 'headers' && Array.isArray(value)) {
      masked.headers = (value as Header[]).map((header) => ({ name: header.name, value: maskSecret(header.value) }))
    }
  }
  return masked
}

const hasSecrets = (secrets: Secrets) => Object.values(secrets).some((value) => (Array.isArray(value) ? value.length > 0 : Boolean(value)))

function toDto(ctx: AppContext, user: User, source: sources.SourceWithStatus) {
  return toSourceDto(source, user.role === 'admin' ? { maskedSecrets: maskSecrets(sourceSecrets(ctx, source)) } : undefined)
}

export async function listSources(ctx: AppContext, user: User) {
  const external = await sources.listSources(ctx.db)
  return [...listInternalSources().map(toInternalSourceDto), ...external.map((source) => toDto(ctx, user, source))]
}

export async function getSource(ctx: AppContext, user: User, id: string) {
  const internal = listInternalSources().find((source) => source.id === id)
  if (internal) return toInternalSourceDto(internal)
  const source = await sources.getSource(ctx.db, id)
  if (!source) throw sourceNotFound()
  return toDto(ctx, user, source)
}

export async function uploadSpreadsheet(ctx: AppContext, user: User, file: { filename: string; mimetype: string; data: Buffer }) {
  assertAdmin(user)
  const extension = file.filename.toLowerCase().split('.').pop()
  if (extension !== 'csv' && extension !== 'xlsx') {
    throw new DomainError('UNSUPPORTED_FILE', 'Envie uma planilha .csv ou .xlsx.', 415)
  }
  if (file.data.length > MAX_SPREADSHEET_BYTES) throw new DomainError('FILE_TOO_LARGE', 'A planilha passa de 50 MB.', 413)
  const safeName = file.filename.replace(/[^\w.\-]+/g, '_')
  const storagePath = `bi/${randomUUID()}/${safeName}`
  await ctx.storage.put(storagePath, file.data, file.mimetype)
  const sheets = extension === 'xlsx' ? await ctx.biConnectors.listSheets(storagePath) : []
  return { storagePath, originalFilename: file.filename, sheets }
}

/** Reads a sample without saving anything (FR-025). Editing may omit secrets to reuse saved ones. */
export async function previewSource(ctx: AppContext, user: User, input: SourceInput & { sourceId?: string }) {
  assertAdmin(user)
  const saved = input.sourceId ? await sources.getSource(ctx.db, input.sourceId) : null
  const incoming = validated(input.kind, input.config, mergeSecrets(saved ? sourceSecrets(ctx, saved) : {}, input.secrets ?? {}))
  const sample: Record<string, unknown>[] = []
  for await (const row of ctx.biConnectors.read(input.kind, incoming.config, incoming.secrets)) {
    sample.push(row)
    if (sample.length >= TYPE_SAMPLE_ROWS) break
  }
  const normalizer = new RowNormalizer(buildFields(keysOf(sample), sample, saved?.fields))
  const normalized = sample.map((row) => normalizer.normalize(row))
  const fields = normalizer.fieldsWithCounts()
  const sheets = input.kind === 'spreadsheet_file' ? await ctx.biConnectors.listSheets(String(incoming.config.storagePath)) : undefined
  return {
    fields,
    rows: normalized.slice(0, PREVIEW_ROWS).map((row) => fields.map((field) => row[field.key])),
    totalRowsRead: sample.length,
    ...(sheets ? { sheets } : {}),
  }
}

/** Starts a refresh in background; a refresh already running is fine (it will pick up the change next time). */
async function refreshInBackground(ctx: AppContext, source: BiSourceRow, overrides: FieldOverrides = {}) {
  try {
    await startRefresh(ctx, source, overrides)
  } catch (error) {
    if (!(error instanceof DomainError && error.code === 'REFRESH_IN_PROGRESS')) throw error
  }
}

export async function createSource(ctx: AppContext, user: User, input: SourceInput) {
  assertAdmin(user)
  const refreshInterval = input.refreshInterval ?? 'manual'
  validateInterval(input.kind, refreshInterval)
  const { config, secrets } = validated(input.kind, input.config, input.secrets)
  const created = await sources.createSource(ctx.db, {
    name: input.name.trim(),
    kind: input.kind,
    config,
    secretsEncrypted: hasSecrets(secrets) ? encryptSecrets(secrets, ctx.config.BI_SECRETS_KEY) : null,
    refreshInterval,
    createdBy: user.id,
  })
  await refreshInBackground(ctx, created, { types: input.fieldTypes, labels: input.fieldLabels })
  return getSource(ctx, user, created.id)
}

export type SourceUpdate = {
  name?: string
  config?: Record<string, unknown>
  secrets?: Secrets
  refreshInterval?: sources.RefreshInterval
  fieldTypes?: Record<string, FieldType>
  fieldLabels?: Record<string, string>
}

function applyFieldChanges(fields: SourceField[], update: SourceUpdate): SourceField[] {
  return fields.map((field) => ({
    ...field,
    type: update.fieldTypes?.[field.key] ?? field.type,
    label: update.fieldLabels?.[field.key]?.trim() || field.label,
  }))
}

export async function updateSource(ctx: AppContext, user: User, id: string, update: SourceUpdate) {
  assertAdmin(user)
  const current = await sources.getSource(ctx.db, id)
  if (!current) throw sourceNotFound()
  if (update.refreshInterval) validateInterval(current.kind, update.refreshInterval)
  const { config, secrets } = validated(current.kind, update.config ?? current.config, mergeSecrets(sourceSecrets(ctx, current), update.secrets ?? {}))
  const typesChanged = Object.entries(update.fieldTypes ?? {}).some(([key, type]) => current.fields.find((field) => field.key === key)?.type !== type)
  const updated = await sources.updateSource(ctx.db, id, {
    ...(update.name ? { name: update.name.trim() } : {}),
    config,
    secretsEncrypted: hasSecrets(secrets) ? encryptSecrets(secrets, ctx.config.BI_SECRETS_KEY) : null,
    ...(update.refreshInterval ? { refreshInterval: update.refreshInterval } : {}),
    fields: applyFieldChanges(current.fields, update),
  })
  if (update.config || update.secrets || typesChanged) await refreshInBackground(ctx, updated)
  return getSource(ctx, user, id)
}

export async function deleteSource(ctx: AppContext, user: User, id: string) {
  assertAdmin(user)
  if (!(await sources.getSource(ctx.db, id))) throw sourceNotFound()
  const using = await reportsUsingSource(ctx.db, id)
  if (using.length > 0) {
    const names = using.map((report) => `"${report.name}"`).join(', ')
    throw withDetails(conflict('SOURCE_IN_USE', `A fonte é usada pelos relatórios ${names}. Remova-a deles antes de excluir.`), { reports: using })
  }
  await relationships.deleteRelationshipsOf(ctx.db, id)
  // ponytail: the uploaded file stays in storage; Storage has no delete yet.
  await sources.deleteSource(ctx.db, id)
}

export async function refreshSource(ctx: AppContext, user: User, id: string) {
  assertAdmin(user)
  const source = await sources.getSource(ctx.db, id)
  if (!source) throw sourceNotFound()
  await startRefresh(ctx, source)
}

export async function listRelationships(ctx: AppContext) {
  return (await relationships.listRelationships(ctx.db)).map(toRelationshipDto)
}

const COMPATIBLE: Record<FieldType, string> = { text: 'text', boolean: 'text', number: 'number', currency: 'number', date: 'date', datetime: 'date' }

export async function createRelationship(ctx: AppContext, user: User, input: relationships.NewRelationship) {
  assertAdmin(user)
  if (input.leftSourceId === input.rightSourceId) {
    throw new DomainError('VALIDATION_ERROR', 'Escolha duas fontes diferentes.', 422)
  }
  const [left, right] = await Promise.all([datasetFor(ctx.db, input.leftSourceId), datasetFor(ctx.db, input.rightSourceId)])
  const leftField = left.fields.find((field) => field.key === input.leftField)
  const rightField = right.fields.find((field) => field.key === input.rightField)
  if (!leftField || !rightField) throw new DomainError('UNKNOWN_FIELD', 'Campo não encontrado na fonte.', 422)
  if (COMPATIBLE[leftField.type] !== COMPATIBLE[rightField.type]) {
    throw new DomainError('INCOMPATIBLE_FIELDS', `"${leftField.label}" e "${rightField.label}" têm tipos diferentes.`, 422)
  }
  return toRelationshipDto(await relationships.createRelationship(ctx.db, input))
}

export async function deleteRelationship(ctx: AppContext, user: User, id: string) {
  assertAdmin(user)
  await relationships.deleteRelationship(ctx.db, id)
}

