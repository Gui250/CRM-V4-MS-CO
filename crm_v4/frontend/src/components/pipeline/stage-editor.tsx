'use client'

import { closestCenter, DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useState, type KeyboardEvent } from 'react'
import { Button } from '@/components/ui/button'
import { ApiError } from '@/lib/api'
import type { Pipeline, Stage, StageKind } from '@/lib/types'
import { useCreateStage, useDeleteStage, useReorderStages, useUpdateStage } from '@/lib/use-pipelines'
import { STAGE_COLOR_CLASSES, STAGE_COLORS } from './stage-colors'

export const STAGE_NAME_MAX = 40
export const STAGE_LIMIT = 20

const KIND_OPTIONS: { value: StageKind; label: string }[] = [
  { value: 'open', label: 'Aberta' },
  { value: 'won', label: 'Ganho' },
  { value: 'lost', label: 'Perdido' },
]

const errorText = (error: unknown) => (error instanceof ApiError ? error.message : 'Algo deu errado. Tente novamente.')

type DeleteState = { step: 'confirm' } | { step: 'destination'; moveToStageId: string }

function StageRow({
  stage,
  stages,
  pipelineId,
  onKeyboardMove,
  onError,
}: {
  stage: Stage
  stages: Stage[]
  pipelineId: string
  onKeyboardMove: (stageId: string, delta: -1 | 1) => void
  onError: (message: string | null) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: stage.id })
  const updateStage = useUpdateStage()
  const deleteStage = useDeleteStage()
  const [name, setName] = useState(stage.name)
  const [deleting, setDeleting] = useState<DeleteState | null>(null)
  const others = stages.filter((s) => s.id !== stage.id)

  function save(fields: Parameters<typeof updateStage.mutate>[0]) {
    onError(null)
    updateStage.mutate(fields, { onError: (error) => onError(errorText(error)) })
  }

  function rename() {
    const trimmed = name.trim()
    if (trimmed === stage.name) return
    if (!trimmed) return setName(stage.name)
    save({ pipelineId, stageId: stage.id, name: trimmed })
  }

  function remove(moveToStageId?: string) {
    onError(null)
    deleteStage.mutate(
      { pipelineId, stageId: stage.id, ...(moveToStageId ? { moveToStageId } : {}) },
      {
        onSuccess: () => setDeleting(null),
        onError: (error) => {
          if (error instanceof ApiError && error.code === 'STAGE_NOT_EMPTY') setDeleting({ step: 'destination', moveToStageId: others[0]?.id ?? '' })
          else onError(errorText(error))
        },
      },
    )
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (!event.altKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return
    event.preventDefault()
    onKeyboardMove(stage.id, event.key === 'ArrowUp' ? -1 : 1)
  }

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`relative flex flex-col gap-3 bg-paper p-3 ${isDragging ? 'z-10 shadow-lg' : ''}`}
    >
      <div className="flex flex-wrap items-center gap-3">
        <button
          {...attributes}
          {...listeners}
          aria-roledescription="etapa arrastável"
          aria-label={`Reordenar ${stage.name}. Alt + seta para cima ou para baixo`}
          onKeyDown={handleKeyDown}
          className="cursor-grab touch-none px-1 font-mono text-lg leading-none text-muted active:cursor-grabbing"
        >
          ⋮⋮
        </button>
        <span aria-hidden className={`size-3 shrink-0 ${STAGE_COLOR_CLASSES[stage.color].chip}`} />
        <label className="sr-only" htmlFor={`stage-name-${stage.id}`}>
          Nome da etapa {stage.name}
        </label>
        <input
          id={`stage-name-${stage.id}`}
          value={name}
          maxLength={STAGE_NAME_MAX}
          onChange={(e) => setName(e.target.value)}
          onBlur={rename}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          className="min-w-0 flex-1 border-b-2 border-transparent bg-transparent py-1 font-semibold outline-none hover:border-line focus:border-brand"
        />
        <label className="sr-only" htmlFor={`stage-kind-${stage.id}`}>
          Tipo da etapa {stage.name}
        </label>
        <select
          id={`stage-kind-${stage.id}`}
          value={stage.kind}
          onChange={(e) => save({ pipelineId, stageId: stage.id, kind: e.target.value as StageKind })}
          className="bg-mist px-2 py-1 text-sm outline-none"
        >
          {KIND_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <button onClick={() => setDeleting({ step: 'confirm' })} className="px-2 py-1 text-sm font-semibold text-brand hover:underline">
          Excluir
        </button>
      </div>

      <fieldset className="flex flex-wrap gap-1.5 pl-9">
        <legend className="sr-only">Cor da etapa {stage.name}</legend>
        {STAGE_COLORS.map((color) => (
          <label key={color} className="cursor-pointer" title={STAGE_COLOR_CLASSES[color].label}>
            <input
              type="radio"
              name={`stage-color-${stage.id}`}
              value={color}
              checked={stage.color === color}
              onChange={() => save({ pipelineId, stageId: stage.id, color })}
              className="peer sr-only"
            />
            <span className="sr-only">{STAGE_COLOR_CLASSES[color].label}</span>
            <span
              aria-hidden
              className={`block size-5 ${STAGE_COLOR_CLASSES[color].chip} outline-offset-2 peer-checked:outline-2 peer-checked:outline-ink peer-focus-visible:outline-2 peer-focus-visible:outline-brand`}
            />
          </label>
        ))}
      </fieldset>

      {deleting?.step === 'confirm' && (
        <div className="flex flex-wrap items-center gap-2 bg-mist p-2 pl-9 text-sm">
          <span>Excluir a etapa {stage.name}?</span>
          <Button variant="danger" className="h-8" onClick={() => remove()} disabled={deleteStage.isPending}>
            Confirmar exclusão
          </Button>
          <Button variant="ghost" className="h-8" onClick={() => setDeleting(null)}>
            Cancelar
          </Button>
        </div>
      )}
      {deleting?.step === 'destination' && (
        <div className="flex flex-wrap items-center gap-2 bg-mist p-2 pl-9 text-sm">
          <label htmlFor={`stage-dest-${stage.id}`}>Esta etapa tem leads. Mover para</label>
          <select
            id={`stage-dest-${stage.id}`}
            value={deleting.moveToStageId}
            onChange={(e) => setDeleting({ step: 'destination', moveToStageId: e.target.value })}
            className="bg-paper px-2 py-1 outline-none"
          >
            {others.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <Button variant="danger" className="h-8" onClick={() => remove(deleting.moveToStageId)} disabled={deleteStage.isPending}>
            Mover leads e excluir
          </Button>
          <Button variant="ghost" className="h-8" onClick={() => setDeleting(null)}>
            Cancelar
          </Button>
        </div>
      )}
    </li>
  )
}

/** Admin view to build a pipeline's stages (US3). */
export function StageEditor({ pipeline }: { pipeline: Pipeline }) {
  const reorder = useReorderStages()
  const createStage = useCreateStage()
  const [order, setOrder] = useState<string[] | null>(null)
  const [newName, setNewName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  // Optimistic order while the PUT is in flight; the refetched pipeline takes over afterwards.
  const stages = order ? order.map((id) => pipeline.stages.find((s) => s.id === id)).filter((s): s is Stage => Boolean(s)) : pipeline.stages

  function commitOrder(next: string[], moved: Stage) {
    setOrder(next)
    setError(null)
    reorder.mutate(
      { pipelineId: pipeline.id, stageIds: next },
      {
        onSuccess: () => setAnnouncement(`${moved.name} agora é a etapa ${next.indexOf(moved.id) + 1} de ${next.length}.`),
        onError: (e) => setError(errorText(e)),
        onSettled: () => setOrder(null),
      },
    )
  }

  function moveBy(stageId: string, delta: -1 | 1) {
    const ids = stages.map((s) => s.id)
    const from = ids.indexOf(stageId)
    const to = from + delta
    if (to < 0 || to >= ids.length) return
    commitOrder(arrayMove(ids, from, to), stages[from]!)
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return
    const ids = stages.map((s) => s.id)
    const moved = stages.find((s) => s.id === active.id)!
    commitOrder(arrayMove(ids, ids.indexOf(String(active.id)), ids.indexOf(String(over.id))), moved)
  }

  function addStage() {
    const name = newName.trim()
    if (!name) return
    setError(null)
    createStage.mutate({ pipelineId: pipeline.id, name }, { onSuccess: () => setNewName(''), onError: (e) => setError(errorText(e)) })
  }

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <p role="alert" className="bg-brand px-3 py-2 text-sm font-semibold text-white">
          {error}
        </p>
      )}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
        accessibility={{ screenReaderInstructions: { draggable: 'Arraste para reordenar, ou use Alt + seta para cima e para baixo.' } }}
      >
        <SortableContext items={stages.map((s) => s.id)} strategy={verticalListSortingStrategy}>
          <ol aria-label="Etapas do funil" className="flex flex-col gap-2">
            {stages.map((stage) => (
              <StageRow key={stage.id} stage={stage} stages={stages} pipelineId={pipeline.id} onKeyboardMove={moveBy} onError={setError} />
            ))}
          </ol>
        </SortableContext>
      </DndContext>
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          addStage()
        }}
      >
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <label htmlFor="new-stage" className="text-xs font-semibold uppercase tracking-[0.12em]">
            Nova etapa
          </label>
          <input
            id="new-stage"
            value={newName}
            maxLength={STAGE_NAME_MAX}
            onChange={(e) => setNewName(e.target.value)}
            disabled={stages.length >= STAGE_LIMIT}
            className="h-11 border-b-2 border-ink/20 bg-mist px-3 outline-none focus:border-brand focus:bg-paper"
          />
        </div>
        <Button type="submit" disabled={!newName.trim() || createStage.isPending || stages.length >= STAGE_LIMIT}>
          Adicionar etapa
        </Button>
      </form>
      {stages.length >= STAGE_LIMIT && <p className="text-sm text-muted">Limite de {STAGE_LIMIT} etapas por funil atingido.</p>}
    </div>
  )
}
