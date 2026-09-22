import { bucketRange, formatBucket, formatCell, nextGrain } from './format'
import type { DateGrain, FieldType, Filter, ReportPage, Scalar, Source, Visual } from './types'

// Per-page interaction state of whoever is viewing the report (FR-018/FR-019). Never persisted.

export type CrossFilter = {
  visualId: string
  sourceId: string
  field: string
  op: 'in' | 'between'
  values: Scalar[]
  /** Set when the clicked category was a date bucket; only used to label the trail. */
  grain?: DateGrain
}
/** One drill level: `from` is the grain that was clicked, `grain` the one now shown, [start, end] the clicked bucket. */
export type DrillLevel = { from: DateGrain; grain: DateGrain; start: string; end: string }
export type PageViewState = {
  crossFilter?: CrossFilter
  drill: Record<string, DrillLevel[]>
  overrides: Record<number, Filter>
}

export type ViewAction =
  | { type: 'toggleCrossFilter'; crossFilter: CrossFilter }
  | { type: 'drillDown'; visualId: string; fromGrain: DateGrain; bucket: string }
  | { type: 'drillUp'; visualId: string }
  | { type: 'overridePageFilter'; index: number; filter: Filter }
  | { type: 'removeTrailItem'; id: string }
  | { type: 'clearAll' }

export const emptyViewState = (): PageViewState => ({ drill: {}, overrides: {} })

const sameCrossFilter = (a: CrossFilter, b: CrossFilter) =>
  a.visualId === b.visualId && a.field === b.field && JSON.stringify(a.values) === JSON.stringify(b.values)

export function viewReducer(state: PageViewState, action: ViewAction): PageViewState {
  switch (action.type) {
    case 'toggleCrossFilter': {
      // One cross-filter at a time; clicking the same point again clears it.
      const { crossFilter: _current, ...rest } = state
      if (state.crossFilter && sameCrossFilter(state.crossFilter, action.crossFilter)) return rest
      return { ...rest, crossFilter: action.crossFilter }
    }
    case 'drillDown': {
      const grain = nextGrain(action.fromGrain)
      if (!grain) return state
      const [start, end] = bucketRange(action.bucket, action.fromGrain)
      const levels = state.drill[action.visualId] ?? []
      return { ...state, drill: { ...state.drill, [action.visualId]: [...levels, { from: action.fromGrain, grain, start, end }] } }
    }
    case 'drillUp':
      return truncateDrill(state, action.visualId, (state.drill[action.visualId]?.length ?? 0) - 1)
    case 'overridePageFilter':
      return { ...state, overrides: { ...state.overrides, [action.index]: action.filter } }
    case 'removeTrailItem': {
      const [kind, a, b] = action.id.split(':')
      if (kind === 'crossFilter') {
        const { crossFilter: _removed, ...rest } = state
        return rest
      }
      if (kind === 'override') {
        const { [Number(a)]: _removed, ...overrides } = state.overrides
        return { ...state, overrides }
      }
      if (kind === 'drill' && a) return truncateDrill(state, a, Number(b))
      return state
    }
    case 'clearAll':
      return emptyViewState()
  }
}

function truncateDrill(state: PageViewState, visualId: string, length: number): PageViewState {
  const { [visualId]: levels = [], ...drill } = state.drill
  if (length > 0) drill[visualId] = levels.slice(0, length)
  return { ...state, drill }
}

/** First date dimension of a visual: the one drill-down acts on. */
export const drillField = (visual: Visual) => visual.slots.category?.find((f) => f.dateGrain)

/** Grain currently shown by a date category after drilling. */
export const effectiveGrain = (visual: Visual, state?: PageViewState) =>
  state?.drill[visual.id]?.at(-1)?.grain ?? drillField(visual)?.dateGrain

/** Cross-filter produced by clicking `value` (raw category value; ISO for date buckets) on `visual`. */
export function crossFilterFor(visual: Visual, value: Scalar, state?: PageViewState): CrossFilter | null {
  const category = visual.slots.category?.[0]
  if (!category || !visual.sourceId) return null
  const base = { visualId: visual.id, sourceId: visual.sourceId, field: category.field }
  const grain = category.dateGrain ? effectiveGrain(visual, state) : undefined
  if (grain && typeof value === 'string') return { ...base, op: 'between', values: bucketRange(value, grain), grain }
  return { ...base, op: 'in', values: [value] }
}

export type TrailItem = { id: string; label: string; kind: 'override' | 'crossFilter' | 'drill' }

function fieldInfo(sourcesById: Record<string, Source>, sourceId: string, key: string): { label: string; type: FieldType } {
  const field = sourcesById[sourceId]?.fields.find((f) => f.key === key)
  return field ?? { label: key, type: 'text' }
}

function describeFilter(filter: Filter, type: FieldType) {
  const fmt = (v: Scalar | undefined) => formatCell(v, type)
  switch (filter.op) {
    case 'in':
      return filter.values.map(fmt).join(', ')
    case 'not_in':
      return `exceto ${filter.values.map(fmt).join(', ')}`
    case 'between':
      return `${fmt(filter.values[0])} a ${fmt(filter.values[1])}`
    case 'gte':
      return `a partir de ${fmt(filter.values[0])}`
    case 'lte':
      return `até ${fmt(filter.values[0])}`
    case 'is_null':
      return '(vazio)'
    case 'not_null':
      return 'preenchido'
  }
}

/** Breadcrumb of everything the viewer changed on this page, each removable via `removeTrailItem`. */
export function trailItems(state: PageViewState, page: ReportPage, sourcesById: Record<string, Source>): TrailItem[] {
  const items: TrailItem[] = []
  for (const [index, filter] of Object.entries(state.overrides)) {
    const info = fieldInfo(sourcesById, filter.sourceId, filter.field)
    items.push({ id: `override:${index}`, kind: 'override', label: `${info.label}: ${describeFilter(filter, info.type)}` })
  }
  const cross = state.crossFilter
  if (cross) {
    const info = fieldInfo(sourcesById, cross.sourceId, cross.field)
    const value = cross.grain ? formatBucket(String(cross.values[0]), cross.grain) : describeFilter({ ...cross }, info.type)
    items.push({ id: 'crossFilter', kind: 'crossFilter', label: `${info.label}: ${value}` })
  }
  for (const [visualId, levels] of Object.entries(state.drill)) {
    const visual = page.visuals.find((v) => v.id === visualId)
    const field = visual && drillField(visual)
    if (!visual?.sourceId || !field) continue
    const { label } = fieldInfo(sourcesById, visual.sourceId, field.field)
    levels.forEach((level, i) =>
      items.push({ id: `drill:${visualId}:${i}`, kind: 'drill', label: `${label}: ${formatBucket(level.start, level.from)}` }),
    )
  }
  return items
}
