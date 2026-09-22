'use client'

import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useMemo, useReducer, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { ApiError } from '@/lib/api'
import { currentPage, initEditorState } from '@/lib/bi/editor-reducer'
import { acceptedSlots } from '@/lib/bi/slots'
import type { QueryRequest, Report, ReportDefinition } from '@/lib/bi/types'
import { useRelationships, useSources, useSuggestPage } from '@/lib/bi/use-bi'
import { CalculatedFields } from './calculated-fields'
import { ConflictBanner } from './conflict-banner'
import { DataRowsDialog } from './data-rows-dialog'
import { biEditorReducer } from './editor-actions'
import { EditorToolbar } from './editor-toolbar'
import { ExportHeader } from './export-header'
import { ExportMenu, useExportTimestamp } from './export-menu'
import { FieldList } from './field-list'
import { suggestedVisualAction } from './field-suggestion'
import { activeFilterLabels, isActiveFilter, withFilterSlots } from './page-filters'
import { PageTabs } from './page-tabs'
import { ReportCanvas } from './report-canvas'
import { indexSources, ReportScopeProvider, usePageViews, type ReportScope } from './report-scope'
import { ReportView } from './report-view'
import { ShareDialog } from './share-dialog'
import { SlotWell } from './slot-well'
import { useUndoShortcuts, useUnsavedGuard } from './use-editor-guards'
import { useReportSave } from './use-report-save'
import { TITLE_INPUT_ID, TYPE_SELECT_ID, VisualProperties } from './visual-properties'
import { VisualPalette } from './visual-palette'

const firstVisualSource = (definition: ReportDefinition) => definition.pages.flatMap((p) => p.visuals).find((v) => v.sourceId)?.sourceId

function EmptyCanvas({ onSuggest, disabled }: { onSuggest: () => void; disabled: boolean }) {
  return (
    <div className="pointer-events-none absolute inset-0 grid place-items-center p-6">
      <div className="pointer-events-auto flex max-w-sm flex-col items-center gap-3 border-2 border-dashed border-ink/20 bg-paper/90 px-8 py-10 text-center">
        <p className="font-display text-lg font-extrabold uppercase [font-stretch:115%]">Tela em branco</p>
        <p className="text-sm text-muted">Arraste um componente da paleta ou um campo da lista para cá.</p>
        <Button onClick={onSuggest} disabled={disabled}>
          Gerar relatório sugerido
        </Button>
      </div>
    </div>
  )
}

/** Report editor (US1/US2/US5): palette | canvas | fields and properties, with explicit save. */
export function ReportEditor({ report, canShare, currentUserId }: { report: Report; canShare: boolean; currentUserId?: string }) {
  const [state, dispatch] = useReducer(biEditorReducer, report, initEditorState)
  const sources = useSources()
  const relationships = useRelationships()
  const client = useQueryClient()
  const sourcesById = useMemo(() => indexSources(sources.data), [sources.data])
  const rawPage = currentPage(state)
  const page = useMemo(() => withFilterSlots(rawPage), [rawPage])
  const [view, dispatchView] = usePageViews(page.id)
  const selected = rawPage.visuals.find((v) => v.id === state.selectedVisualId) ?? null
  const [pickedSourceId, setPickedSourceId] = useState<string>()
  const sourceId = pickedSourceId ?? firstVisualSource(state.definition) ?? sources.data?.[0]?.id
  const saving = useReportSave(report.id, state, dispatch)
  const suggest = useSuggestPage()
  const [previewing, setPreviewing] = useState(false)
  const [sharing, setSharing] = useState(false)
  const [dataFor, setDataFor] = useState<{ title: string; request: QueryRequest } | null>(null)
  const [generatedAt, refreshGeneratedAt] = useExportTimestamp()
  const pageRef = useRef<HTMLDivElement>(null)
  const undo = useCallback(() => dispatch({ type: 'undo' }), [])
  const redo = useCallback(() => dispatch({ type: 'redo' }), [])
  useUnsavedGuard(state.isDirty)
  useUndoShortcuts(undo, redo)

  const focusField = (visualId: string, elementId: string) => {
    dispatch({ type: 'selectVisual', visualId })
    requestAnimationFrame(() => document.getElementById(elementId)?.focus())
  }
  const runSuggest = () => sourceId && suggest.mutate(sourceId, { onSuccess: (suggested) => dispatch({ type: 'replacePage', page: suggested }) })

  const scope: ReportScope = {
    definition: state.definition,
    page,
    view,
    dispatchView,
    sourcesById,
    relationships: relationships.data ?? [],
    setFilter: (index, filter) =>
      dispatch({ type: 'updatePage', page: { ...rawPage, filters: page.filters.map((f, i) => (i === index ? filter : f)).filter(isActiveFilter) } }),
    openData: (title, request) => setDataFor({ title, request }),
    editing: {
      onRemove: (visualId) => dispatch({ type: 'removeVisual', visualId }),
      onProperties: (visualId) => focusField(visualId, TITLE_INPUT_ID),
      onChangeType: (visualId) => focusField(visualId, TYPE_SELECT_ID),
    },
  }

  if (previewing) {
    return (
      <ReportView
        reportName={state.name}
        definition={state.definition}
        actions={
          <Button variant="secondary" className="h-9" onClick={() => setPreviewing(false)}>
            Voltar a editar
          </Button>
        }
      />
    )
  }

  const panelSourceId = selected?.sourceId ?? sourceId
  const errorMessage = saving.error ?? (suggest.isError ? (suggest.error instanceof ApiError ? suggest.error.message : 'Não foi possível gerar o relatório sugerido.') : null)

  return (
    <div className="flex h-full flex-col bg-mist">
      <EditorToolbar
        name={state.name}
        onRename={(name) => dispatch({ type: 'rename', name })}
        sources={sources.data ?? []}
        sourceId={sourceId}
        onPickSource={setPickedSourceId}
        canUndo={state.past.length > 0}
        canRedo={state.future.length > 0}
        onUndo={undo}
        onRedo={redo}
        onSuggest={runSuggest}
        isSuggesting={suggest.isPending}
        onPreview={() => setPreviewing(true)}
        onShare={canShare ? () => setSharing(true) : undefined}
        exportMenu={<ExportMenu targetRef={pageRef} reportName={state.name} pageName={rawPage.name} onBeforeExport={refreshGeneratedAt} />}
        onSave={saving.save}
        isSaving={saving.isSaving}
        isDirty={state.isDirty}
      />
      {saving.conflict && <ConflictBanner conflict={saving.conflict} onReload={saving.reload} onOverwrite={saving.overwrite} />}
      {errorMessage && (
        <p role="alert" className="bi-no-print bg-brand px-4 py-2 text-sm font-semibold text-white">
          {errorMessage}
        </p>
      )}
      <div className="flex min-h-0 flex-1">
        <aside aria-label="Paleta de componentes" className="w-44 shrink-0 overflow-y-auto border-r border-line bg-paper p-3">
          <VisualPalette onAdd={(visualType) => dispatch({ type: 'addVisual', visualType, sourceId })} />
        </aside>
        <div className="bi-scroll flex min-w-0 flex-1 flex-col overflow-y-auto">
          <PageTabs
            pages={state.definition.pages}
            currentPageId={rawPage.id}
            onSelect={(pageId) => dispatch({ type: 'setPage', pageId })}
            editing={{
              onAdd: () => dispatch({ type: 'addPage' }),
              onRename: (pageId, name) => dispatch({ type: 'renamePage', pageId, name }),
              onMove: (pageId, toIndex) => dispatch({ type: 'movePage', pageId, toIndex }),
              onRemove: (pageId) => dispatch({ type: 'removePage', pageId }),
            }}
          />
          <div ref={pageRef} className="bi-page flex-1 bg-[radial-gradient(#d4d4d1_1px,transparent_1px)] p-4 [background-size:24px_24px]">
            <ExportHeader reportName={state.name} pageName={rawPage.name} filters={activeFilterLabels(page, view, sourcesById)} generatedAt={generatedAt} />
            <ReportScopeProvider value={scope}>
              <ReportCanvas
                visuals={rawPage.visuals}
                selectedVisualId={state.selectedVisualId}
                pickedSourceId={sourceId}
                pendingFields={state.pendingFields}
                dispatch={dispatch}
                emptyState={<EmptyCanvas onSuggest={runSuggest} disabled={!sourceId || suggest.isPending} />}
              />
            </ReportScopeProvider>
          </div>
        </div>
        <aside aria-label="Campos e propriedades" className="flex w-80 shrink-0 flex-col gap-5 overflow-y-auto border-l border-line bg-paper p-4">
          <FieldList
            source={sourcesById[panelSourceId ?? '']}
            sources={sources.data ?? []}
            relationships={relationships.data ?? []}
            calculatedFields={state.definition.calculatedFields}
            visual={selected}
            onAddToSlot={(field, slot) =>
              selected && dispatch({ type: 'dropField', visualId: selected.id, slot, field: { sourceId: field.sourceId, field: field.field }, fieldType: field.type })
            }
            onCreateVisual={(field) => void suggestedVisualAction(client, field).then(dispatch)}
          />
          {selected && (
            <div className="flex flex-col gap-2">
              {acceptedSlots(selected.type).map((slot) => (
                <SlotWell key={slot} visual={selected} slot={slot} sourcesById={sourcesById} calculatedFields={state.definition.calculatedFields} dispatch={dispatch} />
              ))}
            </div>
          )}
          {selected && <VisualProperties visual={selected} dispatch={dispatch} />}
          <CalculatedFields fields={state.definition.calculatedFields} sourceId={panelSourceId} dispatch={dispatch} />
        </aside>
      </div>
      {sharing && <ShareDialog reportId={report.id} currentUserId={currentUserId} onClose={() => setSharing(false)} />}
      {dataFor && <DataRowsDialog title={dataFor.title} request={dataFor.request} onClose={() => setDataFor(null)} />}
    </div>
  )
}
