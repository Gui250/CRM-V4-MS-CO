// Deterministic suggestions (FR-011, FR-012, research §9): which visual fits a field, and a first
// draft page for a source. Mirrored on the frontend by lib/bi/slots.ts for drops on the canvas.
import { DEFAULT_VISUAL_LIMIT } from './limits.js'
import type { FieldType, Page, SourceField, Visual } from './definition.js'

const NUMERIC: FieldType[] = ['number', 'currency']
const DATES: FieldType[] = ['date', 'datetime']
const MAX_DONUT_SLICES = 6
const RANKING_MIN_VALUES = 3
const RANKING_MAX_VALUES = 50
const MAX_SUGGESTED_KPIS = 2

type VisualDraft = Omit<Visual, 'id' | 'layout'>

const options = { limit: DEFAULT_VISUAL_LIMIT, crossFilter: true }

const isNumeric = (field: SourceField) => NUMERIC.includes(field.type)
const isDate = (field: SourceField) => DATES.includes(field.type)

export function suggestVisualForField(sourceId: string, field: SourceField, distinctCount = Infinity): VisualDraft {
  const ref = { sourceId, field: field.key }
  if (isNumeric(field)) return { type: 'kpi', sourceId, slots: { value: [{ ...ref, aggregation: 'sum' }] }, options }
  if (isDate(field)) {
    return { type: 'line', sourceId, slots: { category: [{ ...ref, dateGrain: 'month' }], value: [{ ...ref, aggregation: 'count' }] }, options }
  }
  const type = distinctCount <= MAX_DONUT_SLICES ? 'donut' : 'bar'
  return { type, sourceId, slots: { category: [ref], value: [{ ...ref, aggregation: 'count' }] }, options }
}

const SIZES: Record<string, { w: number; h: number }> = { kpi: { w: 3, h: 2 }, default: { w: 6, h: 4 } }

/** Packs drafts left to right, top to bottom, on a 12-column grid. */
function layout(drafts: VisualDraft[]): Visual[] {
  let x = 0
  let y = 0
  let rowHeight = 0
  return drafts.map((draft, index) => {
    const size = SIZES[draft.type] ?? SIZES.default!
    if (x + size.w > 12) {
      x = 0
      y += rowHeight
      rowHeight = 0
    }
    const visual = { ...draft, id: `s${index + 1}`, layout: { x, y, ...size } }
    x += size.w
    rowHeight = Math.max(rowHeight, size.h)
    return visual
  })
}

/** A first page: KPIs, a time series and a ranking/breakdown, whatever the fields allow. */
export function suggestPage(source: { id: string; fields: SourceField[] }, distinctCounts: Record<string, number>): Page {
  const sourceId = source.id
  const numeric = source.fields.filter(isNumeric)
  const dateField = source.fields.find(isDate)
  const categorical = source.fields
    .filter((field) => !isNumeric(field) && !isDate(field))
    .map((field) => ({ field, count: distinctCounts[field.key] ?? Infinity }))
    .sort((a, b) => a.count - b.count)
  const counted = source.fields[0]
  const mainValue = numeric[0]
    ? { sourceId, field: numeric[0].key, aggregation: 'sum' as const }
    : counted && { sourceId, field: counted.key, aggregation: 'count' as const }

  const drafts: VisualDraft[] = numeric.slice(0, MAX_SUGGESTED_KPIS).map((field) => suggestVisualForField(sourceId, field))
  if (drafts.length === 0 && mainValue) drafts.push({ type: 'kpi', sourceId, slots: { value: [mainValue] }, options })
  if (dateField && mainValue) {
    drafts.push({ type: 'line', sourceId, slots: { category: [{ sourceId, field: dateField.key, dateGrain: 'month' }], value: [mainValue] }, options })
  }
  // Few values read best as a donut, many as a ranking; fall back so both appear when possible.
  const breakdown = categorical.find(({ count }) => count <= MAX_DONUT_SLICES)
  const ranking =
    categorical.find(({ count }) => count > MAX_DONUT_SLICES && count <= RANKING_MAX_VALUES) ??
    categorical.find(({ field, count }) => field !== breakdown?.field && count >= RANKING_MIN_VALUES && count <= RANKING_MAX_VALUES)
  if (ranking && mainValue) {
    drafts.push({ type: 'bar', sourceId, slots: { category: [{ sourceId, field: ranking.field.key }], value: [mainValue] }, options })
  }
  if (breakdown && breakdown.field !== ranking?.field && mainValue) {
    drafts.push({ type: 'donut', sourceId, slots: { category: [{ sourceId, field: breakdown.field.key }], value: [mainValue] }, options })
  }
  return { id: 'p1', name: 'Página 1', filters: [], visuals: layout(drafts) }
}
