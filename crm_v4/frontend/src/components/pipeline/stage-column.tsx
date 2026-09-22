'use client'

import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useState } from 'react'
import { formatBRL } from '@/lib/format'
import { reportError } from '@/lib/logger'
import type { BoardStage, Lead, Stage } from '@/lib/types'
import { LeadCard, type KeyboardMove } from './lead-card'
import { STAGE_COLOR_CLASSES } from './stage-colors'

export const stageDropId = (stageId: string) => `stage:${stageId}`

const KIND_LABEL = { open: null, won: 'Ganho', lost: 'Perda' } as const

export function StageColumn({
  stage,
  stages,
  onOpenLead,
  onMoveTo,
  onKeyboardMove,
  onLoadMore,
}: {
  stage: BoardStage
  stages: Stage[]
  onOpenLead: (leadId: string) => void
  onMoveTo: (lead: Lead, stageId: string) => void
  onKeyboardMove: (lead: Lead, direction: KeyboardMove) => void
  onLoadMore: (stageId: string, cursor: string) => Promise<void>
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stageDropId(stage.id) })
  const [loading, setLoading] = useState(false)
  const colors = STAGE_COLOR_CLASSES[stage.color]
  const kind = KIND_LABEL[stage.kind]

  async function loadMore(cursor: string) {
    setLoading(true)
    try {
      await onLoadMore(stage.id, cursor)
    } catch (error) {
      reportError(error, 'load more leads')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section aria-labelledby={`stage-${stage.id}`} className="flex w-[17.5rem] shrink-0 snap-start flex-col bg-mist md:w-72">
      <header className={`border-t-4 px-3 pt-2.5 pb-2 ${colors.band}`}>
        <div className="flex items-center justify-between gap-2">
          <h2 id={`stage-${stage.id}`} className="truncate font-display text-sm font-extrabold uppercase tracking-wide [font-stretch:112%]">
            {stage.name}
          </h2>
          <span className="font-mono text-xs font-bold" aria-label={`${stage.leadCount} leads`}>
            {stage.leadCount}
          </span>
        </div>
        <div className="mt-0.5 flex items-center justify-between font-mono text-[11px]">
          <span aria-label={`Total ${formatBRL(stage.valueTotalCents)}`}>{formatBRL(stage.valueTotalCents)}</span>
          {kind && <span className="uppercase tracking-wider">{kind}</span>}
        </div>
      </header>

      <SortableContext items={stage.leads.map((lead) => lead.id)} strategy={verticalListSortingStrategy}>
        <ul
          ref={setNodeRef}
          aria-label={`Leads em ${stage.name}`}
          className={`flex min-h-24 flex-1 flex-col gap-2 overflow-y-auto p-2 transition-colors ${isOver ? 'bg-line' : ''}`}
        >
          {stage.leads.map((lead) => (
            <LeadCard key={lead.id} lead={lead} stages={stages} onOpen={onOpenLead} onMoveTo={onMoveTo} onKeyboardMove={onKeyboardMove} />
          ))}
          {stage.leads.length === 0 && <li className="px-2 py-6 text-center text-xs text-muted">Nenhum lead nesta etapa</li>}
          {stage.nextCursor && (
            <li>
              <button
                onClick={() => void loadMore(stage.nextCursor!)}
                disabled={loading}
                className="w-full py-2 text-xs font-semibold text-brand hover:underline disabled:text-muted"
              >
                {loading ? 'Carregando…' : 'Carregar mais'}
              </button>
            </li>
          )}
        </ul>
      </SortableContext>
    </section>
  )
}
