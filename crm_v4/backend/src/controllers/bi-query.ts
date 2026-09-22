import type { AppContext } from '../context.js'
import type { User } from '../models/user.js'
import { DomainError } from '../lib/errors.js'
import { datasetFor, type Dataset } from '../models/bi/dataset.js'
import {
  CALCULATED_PREFIX,
  type CalculatedField,
  type Filter,
  type QueryRequest,
} from '../models/bi/definition.js'
import { compileQuery, runQuery, type RelatedDataset } from '../models/bi/query-compiler.js'
import { linksOf } from '../models/bi/relationship.js'
import { csvCell, listRows, streamRowsCsv, type RowsRequest } from '../models/bi/rows.js'
import { suggestPage } from '../models/bi/suggestions.js'

const QUERY_CANCELED = '57014'
const MAX_MEASURES_PER_QUERY = 5

function isTimeout(error: unknown) {
  const code = (error as { code?: string })?.code ?? (error as { cause?: { code?: string } })?.cause?.code
  return code === QUERY_CANCELED
}

const queryTimeout = () => new DomainError('QUERY_TIMEOUT', 'A consulta demorou demais. Tente filtrar um período menor.', 504)

/** Datasets linked to the primary one by a relationship; unreadable ones are skipped. */
export async function relatedDatasets(ctx: AppContext, sourceId: string): Promise<RelatedDataset[]> {
  const links = await linksOf(ctx.db, sourceId)
  const related = await Promise.all(
    links.map(async (link) => {
      const dataset = await datasetFor(ctx.db, link.otherSourceId).catch(() => null)
      return dataset ? { dataset, localField: link.localField, remoteField: link.remoteField } : null
    }),
  )
  return related.filter((item) => item !== null)
}

type FieldCheck = (sourceId: string, field: string) => boolean

function fieldChecker(primary: Dataset, related: RelatedDataset[], calculated: CalculatedField[]): FieldCheck {
  const keys = new Map([primary, ...related.map((item) => item.dataset)].map((dataset) => [dataset.sourceId, new Set(dataset.fields.map((field) => field.key))]))
  const calcIds = new Set(calculated.map((calc) => `${CALCULATED_PREFIX}${calc.id}`))
  return (sourceId, field) => (field.startsWith(CALCULATED_PREFIX) ? calcIds.has(field) : (keys.get(sourceId)?.has(field) ?? false))
}

/**
 * Drops references to fields that no longer exist (a renamed spreadsheet column, a property gone
 * from an API) so the component shows a warning instead of failing (spec edge case).
 */
function withoutMissingFields(request: QueryRequest, exists: FieldCheck, relatedIds: Set<string>) {
  const missing = new Set<string>()
  const keep = <T extends { sourceId: string; field: string }>(ref: T) => {
    const known = ref.sourceId === request.sourceId || relatedIds.has(ref.sourceId)
    if (known && !exists(ref.sourceId, ref.field)) missing.add(ref.field)
    return !known || exists(ref.sourceId, ref.field)
  }
  const cleaned: QueryRequest = {
    ...request,
    dimensions: request.dimensions.filter(keep),
    measures: request.measures.filter(keep),
    filters: request.filters.filter((filter: Filter) => keep(filter)),
  }
  return { cleaned, missing: [...missing] }
}

function staleWarning(dataset: Dataset): string | null {
  if (!dataset.lastError) return null
  const asOf = dataset.dataAsOf ? `Dados de ${csvCell(dataset.dataAsOf.toISOString(), 'datetime')}` : 'Sem dados'
  return `${asOf}; a última atualização falhou.`
}

async function withTimeout<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } catch (error) {
    if (isTimeout(error)) throw queryTimeout()
    throw error
  }
}

export async function runVisualQuery(ctx: AppContext, _user: User, request: QueryRequest) {
  const primary = await datasetFor(ctx.db, request.sourceId)
  const related = await relatedDatasets(ctx, request.sourceId)
  const exists = fieldChecker(primary, related, request.calculatedFields)
  const { cleaned, missing } = withoutMissingFields(request, exists, new Set(related.map((item) => item.dataset.sourceId)))
  const usedKeys = new Set([...cleaned.dimensions, ...cleaned.measures].filter((ref) => ref.sourceId === primary.sourceId).map((ref) => ref.field))
  const ignoredRows = primary.fields.filter((field) => usedKeys.has(field.key)).reduce((sum, field) => sum + field.invalidCount, 0)
  const nothingToAsk = cleaned.dimensions.length === 0 && cleaned.measures.length === 0
  const result = nothingToAsk
    ? { columns: [], rows: [] }
    : await withTimeout(() => runQuery(ctx.db, compileQuery({ primary, related }, cleaned)))
  return {
    ...result,
    ignoredRows,
    dataAsOf: (primary.dataAsOf ?? new Date()).toISOString(),
    staleWarning: staleWarning(primary),
    missingFields: missing,
  }
}

export async function listSourceRows(ctx: AppContext, _user: User, input: RowsRequest & { sourceId: string; page: number }) {
  const primary = await datasetFor(ctx.db, input.sourceId)
  const related = await relatedDatasets(ctx, input.sourceId)
  return withTimeout(() => listRows(ctx.db, { primary, related }, input, input.page))
}

export async function sourceRowsCsv(ctx: AppContext, _user: User, input: RowsRequest & { sourceId: string }) {
  const primary = await datasetFor(ctx.db, input.sourceId)
  const related = await relatedDatasets(ctx, input.sourceId)
  return { name: primary.name, chunks: streamRowsCsv(ctx.db, { primary, related }, input) }
}

/** Distinct value counts of the categorical fields, used to pick donut vs ranking. */
async function distinctCounts(ctx: AppContext, dataset: Dataset): Promise<Record<string, number>> {
  const categorical = dataset.fields.filter((field) => field.type === 'text' || field.type === 'boolean')
  const counts: Record<string, number> = {}
  for (let start = 0; start < categorical.length; start += MAX_MEASURES_PER_QUERY) {
    const chunk = categorical.slice(start, start + MAX_MEASURES_PER_QUERY)
    const request: QueryRequest = {
      sourceId: dataset.sourceId,
      dimensions: [],
      measures: chunk.map((field) => ({ sourceId: dataset.sourceId, field: field.key, aggregation: 'count_distinct' })),
      filters: [],
      calculatedFields: [],
      limit: 1,
      groupOthers: false,
    }
    const { rows } = await withTimeout(() => runQuery(ctx.db, compileQuery({ primary: dataset }, request)))
    chunk.forEach((field, index) => (counts[field.key] = Number(rows[0]?.[index] ?? 0)))
  }
  return counts
}

export async function suggestReportPage(ctx: AppContext, _user: User, sourceId: string) {
  const dataset = await datasetFor(ctx.db, sourceId)
  return suggestPage({ id: dataset.sourceId, fields: dataset.fields }, await distinctCounts(ctx, dataset))
}
