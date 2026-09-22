import type { QueryClient } from '@tanstack/react-query'
import type { Board, BoardStage, Lead } from './types'

/** `assignee`: '' (everyone), 'none' (unassigned) or a user id; resolved before it reaches the key. */
export type BoardFilter = { assignee: string; search: string }
export const NO_FILTER: BoardFilter = { assignee: '', search: '' }

export type LeadSnapshot = { stageId: string; valueCents: number | null }
export type LeadDeletedEvent = { leadId: string; pipelineId: string; stageId: string; valueCents: number | null }

export const boardKey = (pipelineId: string, filter: BoardFilter) => ['board', pipelineId, filter] as const
export const contactLeadsKey = (contactId: string) => ['leads', 'contact', contactId] as const

/** Mirrors the server's POSITION_GAP (backend/src/models/lead.ts). */
export const POSITION_GAP = 1024

const isUnfiltered = (filter: BoardFilter) => !filter.assignee && !filter.search.trim()
const byPosition = (a: Lead, b: Lead) => a.position - b.position || (a.id < b.id ? -1 : 1)
const value = (cents: number | null | undefined) => cents ?? 0

/** Same rules as the server filter: assignee, then name / title / phone digits. */
export function matchesFilter(lead: Lead, filter: BoardFilter): boolean {
  if (filter.assignee === 'none' && lead.assignee) return false
  if (filter.assignee && filter.assignee !== 'none' && lead.assignee?.id !== filter.assignee) return false
  const term = filter.search.trim().toLowerCase()
  if (!term) return true
  const digits = term.replace(/\D/g, '')
  return (
    Boolean(lead.contact.name?.toLowerCase().includes(term)) ||
    Boolean(lead.title?.toLowerCase().includes(term)) ||
    (digits.length > 0 && lead.contact.phone.includes(digits))
  )
}

function adjust(stage: BoardStage, count: number, cents: number): BoardStage {
  return { ...stage, leadCount: Math.max(0, stage.leadCount + count), valueTotalCents: stage.valueTotalCents + cents }
}

/** A card belongs in the loaded list unless the column has more pages and it sorts after them. */
function fitsLoadedRange(stage: BoardStage, lead: Lead) {
  const last = stage.leads.at(-1)
  return !stage.nextCursor || !last || byPosition(lead, last) <= 0
}

function insertCard(stage: BoardStage, lead: Lead): BoardStage {
  if (!fitsLoadedRange(stage, lead)) return stage
  return { ...stage, leads: [...stage.leads, lead].sort(byPosition) }
}

const findCard = (board: Board, leadId: string) => {
  for (const stage of board.stages) {
    const card = stage.leads.find((l) => l.id === leadId)
    if (card) return { stage, card }
  }
  return null
}

/**
 * Places a created, edited or moved lead. Column totals use the loaded card when there is one,
 * otherwise the `previous` snapshot from the event (exact without a filter).
 */
export function applyLeadUpsert(board: Board, lead: Lead, previous: LeadSnapshot | null, filter: BoardFilter): Board {
  if (lead.pipelineId !== board.pipeline.id) return board
  const found = findCard(board, lead.id)
  const matches = matchesFilter(lead, filter)
  const before: LeadSnapshot | null = found
    ? { stageId: found.stage.id, valueCents: found.card.valueCents }
    : previous && isUnfiltered(filter)
      ? previous
      : null

  const stages = board.stages.map((stage) => {
    let next: BoardStage = { ...stage, leads: stage.leads.filter((l) => l.id !== lead.id) }
    if (before?.stageId === stage.id) next = adjust(next, -1, -value(before.valueCents))
    if (matches && stage.id === lead.stageId) next = insertCard(adjust(next, 1, value(lead.valueCents)), lead)
    return next
  })
  return { ...board, stages }
}

export function applyLeadDelete(board: Board, event: LeadDeletedEvent, filter: BoardFilter): Board {
  if (event.pipelineId !== board.pipeline.id) return board
  const found = findCard(board, event.leadId)
  if (!found && !isUnfiltered(filter)) return board
  const stageId = found?.stage.id ?? event.stageId
  const cents = found ? found.card.valueCents : event.valueCents
  return {
    ...board,
    stages: board.stages.map((stage) =>
      stage.id === stageId ? adjust({ ...stage, leads: stage.leads.filter((l) => l.id !== event.leadId) }, -1, -value(cents)) : stage,
    ),
  }
}

export function applyUnread(board: Board, conversationId: string, unreadCount: number): Board {
  return {
    ...board,
    stages: board.stages.map((stage) => ({
      ...stage,
      leads: stage.leads.map((l) => (l.conversationId === conversationId ? { ...l, unreadCount } : l)),
    })),
  }
}

/** Client-side guess of the server position, so an optimistic move lands in the right slot. */
export function estimatePosition(cards: Lead[], beforeLeadId: string | null): number {
  if (!beforeLeadId) {
    const last = cards.at(-1)
    return last ? last.position + POSITION_GAP : 0
  }
  const index = cards.findIndex((l) => l.id === beforeLeadId)
  const before = cards[index]
  if (!before) return estimatePosition(cards, null)
  const previous = cards[index - 1]
  return previous ? (previous.position + before.position) / 2 : before.position - POSITION_GAP
}

// --- Query-cache wiring used by SSE handlers and mutations ---

function forEachBoard(client: QueryClient, pipelineId: string | null, update: (board: Board, filter: BoardFilter) => Board) {
  for (const [key, data] of client.getQueriesData<Board>({ queryKey: pipelineId ? ['board', pipelineId] : ['board'] })) {
    if (!data) continue
    client.setQueryData<Board>(key, update(data, (key[2] as BoardFilter | undefined) ?? NO_FILTER))
  }
}

export function upsertLeadEverywhere(client: QueryClient, lead: Lead, previous: LeadSnapshot | null) {
  forEachBoard(client, lead.pipelineId, (board, filter) => applyLeadUpsert(board, lead, previous, filter))
  client.setQueryData<Lead[]>(contactLeadsKey(lead.contact.id), (leads) =>
    leads ? (leads.some((l) => l.id === lead.id) ? leads.map((l) => (l.id === lead.id ? lead : l)) : [...leads, lead]) : leads,
  )
}

export function deleteLeadEverywhere(client: QueryClient, event: LeadDeletedEvent & { contactId: string }) {
  forEachBoard(client, event.pipelineId, (board, filter) => applyLeadDelete(board, event, filter))
  client.setQueryData<Lead[]>(contactLeadsKey(event.contactId), (leads) => leads?.filter((l) => l.id !== event.leadId))
  client.removeQueries({ queryKey: ['lead', event.leadId] })
}

export function applyUnreadEverywhere(client: QueryClient, conversationId: string, unreadCount: number) {
  forEachBoard(client, null, (board) => applyUnread(board, conversationId, unreadCount))
}
