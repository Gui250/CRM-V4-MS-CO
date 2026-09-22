import { isVisualReady } from './slots'
import {
  CALCULATED_PREFIX,
  DEFAULT_VISUAL_LIMIT,
  type FieldRef,
  type Filter,
  type QueryRequest,
  type Relationship,
  type ReportDefinition,
  type ReportPage,
  type Visual,
} from './types'
import { drillField, type PageViewState } from './view-state'

export type BuildContext = { page: ReportPage; definition: ReportDefinition; view?: PageViewState; relationships?: Relationship[] }

// Ops that mean nothing without values: an empty list filter is "no selection", not "match nothing".
const NEEDS_VALUES = new Set(['in', 'not_in', 'between', 'gte', 'lte'])

const linked = (a: string, b: string, relationships: Relationship[]) =>
  a === b || relationships.some((r) => (r.leftSourceId === a && r.rightSourceId === b) || (r.leftSourceId === b && r.rightSourceId === a))

function collectFilters(visual: Visual, sourceId: string, ctx: BuildContext): Filter[] {
  const view = ctx.view
  const filters = ctx.page.filters.map((filter, index) => view?.overrides[index] ?? filter)
  const cross = view?.crossFilter
  // The visual that originated the cross-filter is only highlighted, never filtered by it.
  if (cross && cross.visualId !== visual.id) filters.push({ sourceId: cross.sourceId, field: cross.field, op: cross.op, values: cross.values })
  const level = view?.drill[visual.id]?.at(-1)
  const dateField = drillField(visual)
  if (level && dateField) filters.push({ sourceId: dateField.sourceId, field: dateField.field, op: 'between', values: [level.start, level.end] })
  // A filter from another source applies only through a relationship (the backend translates it).
  return filters.filter((f) => !(NEEDS_VALUES.has(f.op) && f.values.length === 0) && linked(f.sourceId, sourceId, ctx.relationships ?? []))
}

function calculatedFieldsFor(fields: string[], definition: ReportDefinition) {
  const ids = new Set(fields.filter((f) => f.startsWith(CALCULATED_PREFIX)).map((f) => f.slice(CALCULATED_PREFIX.length)))
  return definition.calculatedFields.filter((c) => ids.has(c.id))
}

/** Query for a visual, or null when it can't query yet (missing fields, text, period filter). */
export function buildQuery(visual: Visual, ctx: BuildContext): QueryRequest | null {
  if (visual.type === 'text' || visual.type === 'filter_date' || !visual.sourceId || !isVisualReady(visual)) return null
  if (visual.type === 'filter_list') return buildFilterOptionsQuery(visual, ctx.definition)

  const grain = ctx.view?.drill[visual.id]?.at(-1)?.grain
  const dateField = drillField(visual)
  const category = (visual.slots.category ?? []).map((f) => (grain && f === dateField ? { ...f, dateGrain: grain } : f))
  const split = visual.slots.legend ?? visual.slots.columns
  const dimensions: FieldRef[] = split ? [...category, split] : category
  // Missing aggregation only happens on hand-written definitions; count works for every type.
  const measures = (visual.slots.value ?? []).map((m) => ({ ...m, aggregation: m.aggregation ?? 'count' }))
  const filters = collectFilters(visual, visual.sourceId, ctx)

  // Tables, pivots and time series must show every row/bucket, never an "Outros" bucket.
  const timeSeries = (visual.type === 'line' || visual.type === 'area') && dateField !== undefined
  const groupOthers = !(visual.type === 'table' || visual.type === 'pivot' || timeSeries)
  const sort = visual.options.sort ?? (timeSeries ? { by: 'category' as const, dir: 'asc' as const } : undefined)

  const request: QueryRequest = {
    sourceId: visual.sourceId,
    dimensions,
    measures,
    filters,
    calculatedFields: calculatedFieldsFor([...dimensions, ...measures, ...filters].map((f) => f.field), ctx.definition),
    limit: visual.options.limit ?? DEFAULT_VISUAL_LIMIT,
    groupOthers,
  }
  if (sort) request.sort = sort
  return request
}

/** Distinct values of a list filter's field with their counts (unfiltered, so every option stays listed). */
export function buildFilterOptionsQuery(visual: Visual, definition?: ReportDefinition): QueryRequest | null {
  const field = visual.slots.category?.[0]
  if (!visual.sourceId || !field) return null
  return {
    sourceId: visual.sourceId,
    dimensions: [field],
    measures: [{ sourceId: field.sourceId, field: field.field, aggregation: 'count' }],
    filters: [],
    calculatedFields: definition ? calculatedFieldsFor([field.field], definition) : [],
    sort: { by: 'category', dir: 'asc' },
    limit: 200,
    groupOthers: false,
  }
}
