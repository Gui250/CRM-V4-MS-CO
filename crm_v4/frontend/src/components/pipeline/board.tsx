'use client'

import {
  closestCorners,
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { useState } from 'react'
import { ApiError } from '@/lib/api'
import type { BoardFilter } from '@/lib/pipeline-cache'
import type { Board as BoardData, Lead } from '@/lib/types'
import { useMoveLead } from '@/lib/use-pipelines'
import { LeadCardBody, leadLabel, type KeyboardMove } from './lead-card'
import { LostReasonDialog } from './lost-reason-dialog'
import { StageColumn } from './stage-column'

type PendingMove = { lead: Lead; stageId: string; beforeLeadId: string | null }

const INSTRUCTIONS =
  'Arraste o cartão para outra etapa, ou use Alt + seta para a direita e para a esquerda para trocar de etapa e Alt + seta para cima e para baixo para reordenar. Enter abre o lead.'

export function Board({
  board,
  filter,
  onOpenLead,
  onLoadMore,
}: {
  board: BoardData
  filter: BoardFilter
  onOpenLead: (leadId: string) => void
  onLoadMore: (stageId: string, cursor: string) => Promise<void>
}) {
  const moveLead = useMoveLead({ pipelineId: board.pipeline.id, filter })
  const [dragging, setDragging] = useState<Lead | null>(null)
  const [pendingLost, setPendingLost] = useState<PendingMove | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const [error, setError] = useState<string | null>(null)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  )

  const leads = board.stages.flatMap((stage) => stage.leads)
  const findLead = (id: string) => leads.find((lead) => lead.id === id)
  const stageOf = (stageId: string) => board.stages.find((stage) => stage.id === stageId)

  function commit(move: PendingMove, lostReason?: string) {
    const stageName = stageOf(move.stageId)?.name ?? ''
    setError(null)
    moveLead.mutate(
      { ...move, lostReason },
      {
        onSuccess: () => setAnnouncement(`${leadLabel(move.lead)} movido para ${stageName}.`),
        onError: (cause) => {
          const reason = cause instanceof ApiError ? cause.message : 'Tente novamente.'
          setError(`O movimento não foi salvo. ${reason}`)
        },
      },
    )
  }

  function move(lead: Lead, stageId: string, beforeLeadId: string | null) {
    const target = stageOf(stageId)
    if (!target) return
    const column = target.leads.filter((l) => l.id !== lead.id)
    const unchanged = lead.stageId === stageId && target.leads.indexOf(lead) === (beforeLeadId ? column.findIndex((l) => l.id === beforeLeadId) : column.length)
    if (unchanged) return
    if (target.kind === 'lost' && lead.stageId !== stageId) setPendingLost({ lead, stageId, beforeLeadId })
    else commit({ lead, stageId, beforeLeadId })
  }

  function keyboardMove(lead: Lead, direction: KeyboardMove) {
    const stageIndex = board.stages.findIndex((stage) => stage.id === lead.stageId)
    const column = board.stages[stageIndex]?.leads ?? []
    const index = column.findIndex((l) => l.id === lead.id)
    if (direction === 'left' || direction === 'right') {
      const next = board.stages[stageIndex + (direction === 'right' ? 1 : -1)]
      if (next) move(lead, next.id, null)
    } else if (direction === 'up' && index > 0) {
      move(lead, lead.stageId, column[index - 1]!.id)
    } else if (direction === 'down' && index < column.length - 1) {
      move(lead, lead.stageId, column[index + 2]?.id ?? null)
    }
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    setDragging(null)
    const lead = findLead(String(active.id))
    if (!lead || !over) return
    const overId = String(over.id)
    if (overId.startsWith('stage:')) return move(lead, overId.slice('stage:'.length), null)
    const overLead = findLead(overId)
    if (!overLead || overLead.id === lead.id) return
    const column = stageOf(overLead.stageId)?.leads ?? []
    const movingDown = lead.stageId === overLead.stageId && column.indexOf(lead) < column.indexOf(overLead)
    const beforeLeadId = movingDown ? (column[column.indexOf(overLead) + 1]?.id ?? null) : overLead.id
    move(lead, overLead.stageId, beforeLeadId)
  }

  const name = (id: string | number) => {
    const lead = findLead(String(id))
    return lead ? leadLabel(lead) : 'Cartão'
  }
  const target = (id: string | number | undefined) => {
    if (id === undefined) return 'fora das etapas'
    const key = String(id)
    const stage = key.startsWith('stage:') ? stageOf(key.slice(6)) : stageOf(findLead(key)?.stageId ?? '')
    return stage ? `a etapa ${stage.name}` : 'fora das etapas'
  }
  const announcements: Announcements = {
    onDragStart: ({ active }) => `${name(active.id)} selecionado.`,
    onDragOver: ({ active, over }) => `${name(active.id)} sobre ${target(over?.id)}.`,
    onDragEnd: ({ active, over }) => `${name(active.id)} solto em ${target(over?.id)}.`,
    onDragCancel: ({ active }) => `Movimento de ${name(active.id)} cancelado.`,
  }

  return (
    <>
      {error && (
        <p role="alert" className="mx-4 mb-2 bg-brand px-3 py-2 text-sm font-semibold text-white md:mx-6">
          {error}
        </p>
      )}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        accessibility={{ announcements, screenReaderInstructions: { draggable: INSTRUCTIONS } }}
        onDragStart={({ active }: DragStartEvent) => setDragging(findLead(String(active.id)) ?? null)}
        onDragCancel={() => setDragging(null)}
        onDragEnd={handleDragEnd}
      >
        {/* relative: keeps sr-only text of off-screen cards inside the scroller instead of widening the page. */}
        <div className="relative flex h-full snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-4 md:snap-none md:px-6">
          {board.stages.map((stage) => (
            <StageColumn
              key={stage.id}
              stage={stage}
              stages={board.stages}
              onOpenLead={onOpenLead}
              onMoveTo={(lead, stageId) => move(lead, stageId, null)}
              onKeyboardMove={keyboardMove}
              onLoadMore={onLoadMore}
            />
          ))}
        </div>
        <DragOverlay dropAnimation={null}>
          {dragging && (
            <div className="w-[17rem] rotate-2 bg-paper p-3 shadow-xl cut-corner [--cut:12px]">
              <LeadCardBody lead={dragging} />
            </div>
          )}
        </DragOverlay>
      </DndContext>
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
      {pendingLost && (
        <LostReasonDialog
          leadName={leadLabel(pendingLost.lead)}
          stageName={stageOf(pendingLost.stageId)?.name ?? ''}
          onCancel={() => setPendingLost(null)}
          onConfirm={(reason) => {
            commit(pendingLost, reason)
            setPendingLost(null)
          }}
        />
      )}
    </>
  )
}
