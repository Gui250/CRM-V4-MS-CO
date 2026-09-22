'use client'

import { useMemo, useRef, useState, type ReactNode } from 'react'
import type { QueryRequest, ReportDefinition } from '@/lib/bi/types'
import { useRelationships, useSources } from '@/lib/bi/use-bi'
import { trailItems } from '@/lib/bi/view-state'
import { DataRowsDialog } from './data-rows-dialog'
import { ExportHeader } from './export-header'
import { ExportMenu, useExportTimestamp } from './export-menu'
import { FilterTrail } from './filter-trail'
import { activeFilterLabels, withFilterSlots } from './page-filters'
import { PageTabs } from './page-tabs'
import { indexSources, ReportScopeProvider, usePageViews, type ReportScope } from './report-scope'
import { StaticGrid } from './static-grid'

/**
 * Read-only report (FR-019): viewers filter, cross-filter and drill, but all of it is local state;
 * nothing here ever saves the report. `actions` holds extra toolbar buttons (e.g. back to editing).
 */
export function ReportView({ reportName, definition, actions }: { reportName: string; definition: ReportDefinition; actions?: ReactNode }) {
  const sources = useSources()
  const relationships = useRelationships()
  const [pageId, setPageId] = useState(definition.pages[0]?.id ?? '')
  const rawPage = definition.pages.find((p) => p.id === pageId) ?? definition.pages[0]!
  const page = useMemo(() => withFilterSlots(rawPage), [rawPage])
  const [view, dispatchView] = usePageViews(page.id)
  const [dataFor, setDataFor] = useState<{ title: string; request: QueryRequest } | null>(null)
  const [generatedAt, refreshGeneratedAt] = useExportTimestamp()
  const pageRef = useRef<HTMLDivElement>(null)
  const sourcesById = useMemo(() => indexSources(sources.data), [sources.data])

  const scope: ReportScope = {
    definition,
    page,
    view,
    dispatchView,
    sourcesById,
    relationships: relationships.data ?? [],
    setFilter: (index, filter) => dispatchView({ type: 'overridePageFilter', index, filter }),
    openData: (title, request) => setDataFor({ title, request }),
  }

  return (
    <div className="bi-scroll flex h-full flex-col overflow-y-auto bg-mist">
      <div className="bi-no-print flex flex-wrap items-center justify-between gap-3 border-b border-line bg-paper px-4 py-3">
        <h1 className="min-w-0 truncate font-display text-xl font-extrabold uppercase [font-stretch:115%]">{reportName}</h1>
        <div className="flex items-center gap-2">
          {actions}
          <ExportMenu targetRef={pageRef} reportName={reportName} pageName={page.name} onBeforeExport={refreshGeneratedAt} />
        </div>
      </div>
      {definition.pages.length > 1 && <PageTabs pages={definition.pages} currentPageId={page.id} onSelect={setPageId} />}
      <FilterTrail
        items={trailItems(view, page, sourcesById)}
        onRemove={(id) => dispatchView({ type: 'removeTrailItem', id })}
        onClear={() => dispatchView({ type: 'clearAll' })}
      />
      <div ref={pageRef} className="bi-page p-4">
        <ExportHeader reportName={reportName} pageName={page.name} filters={activeFilterLabels(page, view, sourcesById)} generatedAt={generatedAt} />
        <ReportScopeProvider value={scope}>
          {page.visuals.length ? <StaticGrid visuals={page.visuals} /> : <p className="py-16 text-center text-sm text-muted">Esta página ainda não tem componentes.</p>}
        </ReportScopeProvider>
      </div>
      {dataFor && <DataRowsDialog title={dataFor.title} request={dataFor.request} onClose={() => setDataFor(null)} />}
    </div>
  )
}
