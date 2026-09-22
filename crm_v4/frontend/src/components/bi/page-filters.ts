import { trailItems, type PageViewState } from '@/lib/bi/view-state'
import type { Filter, ReportPage, Source, Visual } from '@/lib/bi/types'

const FILTER_OP = { filter_list: 'in', filter_date: 'between' } as const

const opFor = (visual: Visual) => (visual.type === 'filter_list' || visual.type === 'filter_date' ? FILTER_OP[visual.type] : null)

/** A filter with nothing selected; build-query ignores it. */
export const isActiveFilter = (filter: Filter) => filter.values.length > 0 || filter.op === 'is_null' || filter.op === 'not_null'

function findFilter(filters: Filter[], visual: Visual) {
  const op = opFor(visual)
  const field = visual.slots.category?.[0]
  if (!op || !field || !visual.sourceId) return -1
  return filters.findIndex((f) => f.sourceId === visual.sourceId && f.field === field.field && f.op === op)
}

/**
 * Page filters plus an empty slot for every filter visual that has no saved filter yet. Viewer
 * overrides are addressed by filter index, so each filter visual needs one to write into.
 */
export function withFilterSlots(page: ReportPage): ReportPage {
  const filters = [...page.filters]
  for (const visual of page.visuals) {
    const op = opFor(visual)
    const field = visual.slots.category?.[0]
    if (op && field && visual.sourceId && findFilter(filters, visual) < 0) filters.push({ sourceId: visual.sourceId, field: field.field, op, values: [] })
  }
  return filters.length === page.filters.length ? page : { ...page, filters }
}

/** Index (in a `withFilterSlots` page) of the filter a filter visual controls, or -1. */
export const filterIndexFor = (page: ReportPage, visual: Visual) => findFilter(page.filters, visual)

/** Readable list of everything filtering the page right now (export header, FR-033). */
export function activeFilterLabels(page: ReportPage, view: PageViewState, sourcesById: Record<string, Source>) {
  // trailItems already knows how to describe overrides; feed it every effective page filter as one.
  const effective = page.filters.map((filter, index) => view.overrides[index] ?? filter)
  const overrides = Object.fromEntries(effective.flatMap((filter, index) => (isActiveFilter(filter) ? [[index, filter]] : [])))
  return trailItems({ ...view, overrides }, page, sourcesById).map((item) => item.label)
}
