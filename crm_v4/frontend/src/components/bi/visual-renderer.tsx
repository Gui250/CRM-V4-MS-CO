'use client'

import { useMemo } from 'react'
import { ApiError } from '@/lib/api'
import { buildQuery } from '@/lib/bi/build-query'
import { isVisualReady } from '@/lib/bi/slots'
import type { AnyFieldRef, QueryRequest, QueryResult, Visual } from '@/lib/bi/types'
import { useVisualQuery } from '@/lib/bi/use-bi'
import { fieldInfo, refLabel, visualTitle } from './field-meta'
import type { MenuItem } from './menu'
import { useReportScope, type ReportScope } from './report-scope'
import { VisualFrame, type FrameState } from './visual-frame'
import { ChartVisual } from './visuals/chart-visual'
import { FilterDateVisual } from './visuals/filter-date-visual'
import { FilterListVisual } from './visuals/filter-list-visual'
import { KpiVisual } from './visuals/kpi-visual'
import { PivotVisual } from './visuals/pivot-visual'
import { TableVisual } from './visuals/table-visual'
import { TextVisual } from './visuals/text-visual'

type Query = ReturnType<typeof useVisualQuery>

const NO_QUERY = new Set<Visual['type']>(['text', 'filter_date'])
const NO_DATA_VIEW = new Set<Visual['type']>(['text', 'filter_date', 'filter_list'])

function frameState(visual: Visual, request: QueryRequest | null, query: Query, scope: ReportScope): FrameState {
  if (visual.type === 'text') return { status: 'ready' }
  if (!isVisualReady(visual) || (!request && !NO_QUERY.has(visual.type))) return { status: 'notReady' }
  if (NO_QUERY.has(visual.type)) return { status: 'ready' }
  if (query.isError) return { status: 'error', errorMessage: query.error instanceof ApiError ? query.error.message : undefined }
  const result = query.data
  if (!result) return { status: 'loading' }
  const external = scope.sourcesById[visual.sourceId ?? '']?.kind !== 'internal'
  return {
    status: result.rows.length === 0 ? 'empty' : 'ready',
    missingFields: result.missingFields,
    ignoredRows: result.ignoredRows,
    staleWarning: result.staleWarning,
    dataAsOf: external ? result.dataAsOf : null,
  }
}

function menuFor(visual: Visual, title: string, request: QueryRequest | null, scope: ReportScope): MenuItem[] {
  const items: MenuItem[] = []
  if (request && !NO_DATA_VIEW.has(visual.type)) items.push({ label: 'Ver dados', onSelect: () => scope.openData(title, request) })
  const editing = scope.editing
  if (editing) {
    items.push(
      { label: 'Mudar tipo', onSelect: () => editing.onChangeType(visual.id) },
      { label: 'Propriedades', onSelect: () => editing.onProperties(visual.id) },
      { label: 'Remover', onSelect: () => editing.onRemove(visual.id) },
    )
  }
  return items
}

function VisualBody({ visual, result, request, title, editing }: { visual: Visual; result: QueryResult | undefined; request: QueryRequest | null; title: string; editing: boolean }) {
  if (visual.type === 'text') return <TextVisual visual={visual} editing={editing} />
  if (visual.type === 'filter_date') return <FilterDateVisual visual={visual} />
  if (!result) return null
  switch (visual.type) {
    case 'kpi':
      return <KpiVisual visual={visual} result={result} request={request} title={title} />
    case 'table':
      return <TableVisual visual={visual} result={result} title={title} />
    case 'pivot':
      return <PivotVisual visual={visual} result={result} title={title} />
    case 'filter_list':
      return <FilterListVisual visual={visual} result={result} title={title} />
    default:
      return <ChartVisual visual={visual} result={result} title={title} />
  }
}

/** One visual: builds its query from the page/view state, runs it and renders the right component. */
export function VisualRenderer({ visual, pendingFields }: { visual: Visual; pendingFields?: AnyFieldRef[] }) {
  const scope = useReportScope()
  const { page, definition, view, relationships, sourcesById } = scope
  const request = useMemo(() => buildQuery(visual, { page, definition, view, relationships }), [visual, page, definition, view, relationships])
  const query = useVisualQuery(request)
  const title = visualTitle(visual, sourcesById, definition.calculatedFields)
  const state = frameState(visual, request, query, scope)
  if (pendingFields?.length) state.pendingFields = pendingFields.map((ref) => refLabel(ref, fieldInfo(sourcesById, definition.calculatedFields, ref)))

  return (
    <VisualFrame title={title} menuItems={menuFor(visual, title, request, scope)} state={state} dragHandle={!!scope.editing}>
      <VisualBody visual={visual} result={query.data} request={request} title={title} editing={!!scope.editing} />
    </VisualFrame>
  )
}
