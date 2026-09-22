'use client'

import { useQueryClient } from '@tanstack/react-query'
import { useMemo, type DragEvent, type KeyboardEvent } from 'react'
import GridLayout, { useContainerWidth, type Layout } from 'react-grid-layout'
import { mergeFieldIntoVisual } from '@/lib/bi/slots'
import type { AnyFieldRef, Visual, VisualLayout } from '@/lib/bi/types'
import type { BiEditorAction } from './editor-actions'
import { FIELD_MIME, VISUAL_MIME, hasDragType, isVisualType, readFieldPayload, visualTitle } from './field-meta'
import { suggestedVisualAction } from './field-suggestion'
import { useReportScope } from './report-scope'
import { GRID_GAP, ROW_HEIGHT } from './static-grid'
import { VisualRenderer } from './visual-renderer'

const COLUMNS = 12
const ARROWS: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }

const overlaps = (a: VisualLayout, b: VisualLayout) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

/** Grid cell under the pointer; omitted when taken so the reducer picks the first free spot. */
function dropPosition(e: DragEvent, container: HTMLElement | null, width: number, visuals: Visual[]) {
  if (!container) return undefined
  const rect = container.getBoundingClientRect()
  const column = (width - GRID_GAP * (COLUMNS - 1)) / COLUMNS + GRID_GAP
  const x = Math.min(COLUMNS - 1, Math.max(0, Math.floor((e.clientX - rect.left) / column)))
  const y = Math.max(0, Math.floor((e.clientY - rect.top) / (ROW_HEIGHT + GRID_GAP)))
  const spot = { x, y, w: 1, h: 1 }
  return visuals.some((v) => overlaps(v.layout, spot)) ? undefined : { x, y }
}

function CanvasItem({ visual, selected, dispatch, pendingFields }: { visual: Visual; selected: boolean; dispatch: (a: BiEditorAction) => void; pendingFields: AnyFieldRef[] | undefined }) {
  const { sourcesById, definition, relationships } = useReportScope()
  const title = visualTitle(visual, sourcesById, definition.calculatedFields)

  function onKeyDown(e: KeyboardEvent) {
    const arrow = ARROWS[e.key]
    if (!arrow || e.target !== e.currentTarget) return
    e.preventDefault()
    const [dx, dy] = arrow
    dispatch(e.shiftKey ? { type: 'resizeBy', visualId: visual.id, dw: dx, dh: dy } : { type: 'nudge', visualId: visual.id, dx, dy })
  }

  function onDrop(e: DragEvent) {
    const field = readFieldPayload(e.dataTransfer)
    if (!field) return
    e.preventDefault()
    e.stopPropagation() // handled here, not as a new visual on the canvas
    const related = relationships.some((r) => [r.leftSourceId, r.rightSourceId].includes(field.sourceId) && [r.leftSourceId, r.rightSourceId].includes(visual.sourceId ?? ''))
    if (visual.sourceId && visual.sourceId !== field.sourceId && !related) return
    const next = mergeFieldIntoVisual(visual, field, field.type)
    if (next !== visual) dispatch({ type: 'replaceVisual', visual: next })
  }

  return (
    <div
      role="group"
      tabIndex={0}
      aria-label={`Componente ${title}`}
      aria-roledescription="componente do relatório"
      aria-describedby="bi-canvas-help"
      onFocus={(e) => e.target === e.currentTarget && !selected && dispatch({ type: 'selectVisual', visualId: visual.id })}
      onMouseDown={() => !selected && dispatch({ type: 'selectVisual', visualId: visual.id })}
      onKeyDown={onKeyDown}
      onDragOver={(e) => hasDragType(e.dataTransfer, FIELD_MIME) && e.preventDefault()}
      onDrop={onDrop}
      className={`h-full outline-offset-0 ${selected ? 'outline-2 outline-brand' : ''}`}
    >
      <VisualRenderer visual={visual} pendingFields={pendingFields} />
    </div>
  )
}

type Props = {
  visuals: Visual[]
  selectedVisualId: string | null
  pickedSourceId: string | undefined
  pendingFields: Record<string, AnyFieldRef[] | undefined>
  dispatch: (action: BiEditorAction) => void
  emptyState: React.ReactNode
}

/** Editable 12-column grid (react-grid-layout): drag/resize, drops from the palette and the field list. */
export function ReportCanvas({ visuals, selectedVisualId, pickedSourceId, pendingFields, dispatch, emptyState }: Props) {
  const { width, containerRef } = useContainerWidth({ initialWidth: 960 })
  const client = useQueryClient()
  const layout = useMemo(() => visuals.map((v) => ({ i: v.id, ...v.layout })), [visuals])
  // Only user gestures are recorded: onLayoutChange also fires on mount and on undo, which would clear redo.
  const commit = (next: Layout) => dispatch({ type: 'moveResize', layouts: next.map(({ i, x, y, w, h }) => ({ i, x, y, w, h })) })

  async function onDrop(e: DragEvent) {
    const visualType = e.dataTransfer.getData(VISUAL_MIME)
    const field = readFieldPayload(e.dataTransfer)
    if (!isVisualType(visualType) && !field) return
    e.preventDefault()
    const layout = dropPosition(e, containerRef.current, width, visuals)
    if (isVisualType(visualType)) return dispatch({ type: 'addVisual', visualType, sourceId: pickedSourceId, layout })
    dispatch(await suggestedVisualAction(client, field!, layout))
  }

  return (
    <div
      ref={containerRef}
      role="region"
      aria-label="Tela do relatório"
      onDragOver={(e) => (hasDragType(e.dataTransfer, VISUAL_MIME) || hasDragType(e.dataTransfer, FIELD_MIME)) && e.preventDefault()}
      onDrop={(e) => void onDrop(e)}
      onMouseDown={(e) => e.target === e.currentTarget && dispatch({ type: 'selectVisual', visualId: null })}
      className="relative min-h-[520px]"
    >
      <p id="bi-canvas-help" className="sr-only">
        Setas movem o componente selecionado; Shift + setas redimensionam.
      </p>
      {visuals.length === 0 && emptyState}
      <GridLayout
        width={width}
        layout={layout}
        gridConfig={{ cols: COLUMNS, rowHeight: ROW_HEIGHT, margin: [GRID_GAP, GRID_GAP], containerPadding: [0, 0] }}
        dragConfig={{ handle: '.bi-drag-handle', cancel: 'button, select, input, textarea' }}
        onDragStop={commit}
        onResizeStop={commit}
      >
        {visuals.map((visual) => (
          <div key={visual.id}>
            <CanvasItem visual={visual} selected={visual.id === selectedVisualId} dispatch={dispatch} pendingFields={pendingFields[visual.id]} />
          </div>
        ))}
      </GridLayout>
    </div>
  )
}
