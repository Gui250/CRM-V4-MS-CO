'use client'

import { createContext, useCallback, useContext, useState, type Dispatch } from 'react'
import { emptyViewState, viewReducer, type PageViewState, type ViewAction } from '@/lib/bi/view-state'
import type { Filter, QueryRequest, Relationship, ReportDefinition, ReportPage, Source } from '@/lib/bi/types'

export type EditingActions = {
  onRemove: (visualId: string) => void
  onProperties: (visualId: string) => void
  onChangeType: (visualId: string) => void
}

/** Everything a visual needs from the report around it; provided by the editor and by the viewer. */
export type ReportScope = {
  definition: ReportDefinition
  /** Current page, passed through `withFilterSlots`. */
  page: ReportPage
  view: PageViewState
  dispatchView: Dispatch<ViewAction>
  sourcesById: Record<string, Source>
  relationships: Relationship[]
  /** Editor: saves the page default. Viewer: temporary override (FR-019). */
  setFilter: (index: number, filter: Filter) => void
  openData: (title: string, request: QueryRequest) => void
  editing?: EditingActions
}

const ScopeContext = createContext<ReportScope | null>(null)

export const ReportScopeProvider = ScopeContext.Provider

export function useReportScope() {
  const scope = useContext(ScopeContext)
  if (!scope) throw new Error('useReportScope outside ReportScopeProvider')
  return scope
}

const EMPTY_VIEW = emptyViewState()

/** Interaction state kept per page, so switching tabs keeps each page's filters (never saved). */
export function usePageViews(pageId: string): [PageViewState, Dispatch<ViewAction>] {
  const [views, setViews] = useState<Record<string, PageViewState>>({})
  const dispatch = useCallback(
    (action: ViewAction) => setViews((all) => ({ ...all, [pageId]: viewReducer(all[pageId] ?? emptyViewState(), action) })),
    [pageId],
  )
  return [views[pageId] ?? EMPTY_VIEW, dispatch]
}

export const indexSources = (sources: Source[] | undefined) => Object.fromEntries((sources ?? []).map((s) => [s.id, s]))
