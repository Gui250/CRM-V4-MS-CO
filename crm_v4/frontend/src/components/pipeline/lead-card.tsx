'use client'

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import Link from 'next/link'
import type { KeyboardEvent } from 'react'
import { ContactAvatar } from '@/components/chat/contact-avatar'
import { Badge } from '@/components/ui/badge'
import { displayName, formatBRL, formatTimeInStage } from '@/lib/format'
import type { Lead, Stage } from '@/lib/types'

export type KeyboardMove = 'left' | 'right' | 'up' | 'down'

const KEY_MOVES: Record<string, KeyboardMove> = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
}

export const leadLabel = (lead: Lead) => lead.title?.trim() || displayName(lead.contact)

export function LeadCardBody({ lead }: { lead: Lead }) {
  const title = leadLabel(lead)
  const contactName = displayName(lead.contact)
  return (
    <span className="flex gap-3">
      <ContactAvatar contact={lead.contact} />
      <span className="min-w-0 flex-1">
        <span className="flex items-start justify-between gap-2">
          <span className="truncate font-semibold leading-tight">{title}</span>
          {lead.unreadCount > 0 && (
            <Badge>
              <span className="sr-only">Mensagens não lidas: </span>
              {lead.unreadCount}
            </Badge>
          )}
        </span>
        {title !== contactName && <span className="block truncate text-xs text-muted">{contactName}</span>}
        <span className="mt-2 flex items-center justify-between gap-2 font-mono text-[11px] text-muted">
          <span className={lead.valueCents === null ? '' : 'font-bold text-ink'}>{formatBRL(lead.valueCents)}</span>
          <span title="Tempo na etapa">{formatTimeInStage(lead.stageEnteredAt)}</span>
        </span>
        <span className="mt-1 block truncate pr-32 text-xs text-muted">{lead.assignee ? lead.assignee.name : 'Sem responsável'}</span>
      </span>
    </span>
  )
}

export function LeadCard({
  lead,
  stages,
  onOpen,
  onMoveTo,
  onKeyboardMove,
}: {
  lead: Lead
  stages: Stage[]
  onOpen: (leadId: string) => void
  onMoveTo: (lead: Lead, stageId: string) => void
  onKeyboardMove: (lead: Lead, direction: KeyboardMove) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: lead.id,
    data: { stageId: lead.stageId },
  })

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const direction = KEY_MOVES[event.key]
    if (event.altKey && direction) {
      event.preventDefault()
      onKeyboardMove(lead, direction)
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onOpen(lead.id)
    }
  }

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`relative bg-paper shadow-[0_1px_0_var(--color-line)] ${isDragging ? 'opacity-40' : ''}`}
    >
      <div
        {...attributes}
        {...listeners}
        aria-roledescription="cartão do funil"
        aria-label={`${leadLabel(lead)}. Abrir lead`}
        onClick={() => onOpen(lead.id)}
        onKeyDown={handleKeyDown}
        className="block cursor-grab touch-manipulation p-3 active:cursor-grabbing"
      >
        <LeadCardBody lead={lead} />
      </div>
      {/* Siblings of the card button (not nested in it), placed over its bottom-right corner. */}
      {lead.conversationId && (
        <Link
          href={`/chat?c=${lead.conversationId}`}
          aria-label={`Abrir conversa com ${displayName(lead.contact)}`}
          className="absolute right-20 bottom-2 bg-mist px-2 py-0.5 text-[11px] font-semibold text-muted hover:bg-ink hover:text-white"
        >
          Conversa
        </Link>
      )}
      <label className="sr-only" htmlFor={`move-${lead.id}`}>
        Mover {leadLabel(lead)} para
      </label>
      <select
        id={`move-${lead.id}`}
        value=""
        onChange={(e) => e.target.value && onMoveTo(lead, e.target.value)}
        className="absolute right-2 bottom-2 w-16 cursor-pointer appearance-none bg-mist px-2 py-0.5 text-right text-[11px] font-semibold text-muted outline-none hover:bg-ink hover:text-white focus-visible:bg-ink focus-visible:text-white"
      >
        <option value="">Mover ▾</option>
        {stages
          .filter((stage) => stage.id !== lead.stageId)
          .map((stage) => (
            <option key={stage.id} value={stage.id}>
              {stage.name}
            </option>
          ))}
      </select>
    </li>
  )
}
