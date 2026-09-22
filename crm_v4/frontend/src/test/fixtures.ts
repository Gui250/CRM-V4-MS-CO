import type { Board, BoardStage, Conversation, Lead, Message, Stage } from '@/lib/types'

export const conversation = (overrides: Partial<Conversation> = {}): Conversation => ({
  id: 'c1',
  contact: { id: 'ct1', phone: '5511987654321', name: 'Cliente Silva', avatarUrl: null },
  lastMessageAt: '2026-09-22T12:00:00.000Z',
  lastMessagePreview: 'oi',
  unreadCount: 0,
  handling: { mode: 'automation', reason: null, summary: null, handoffAt: null, assumedBy: null },
  automationOptOut: false,
  ...overrides,
})

export const message = (overrides: Partial<Message> = {}): Message => ({
  id: 'm1',
  conversationId: 'c1',
  direction: 'inbound',
  type: 'text',
  body: 'oi',
  media: null,
  status: null,
  sentBy: null,
  automation: null,
  sentAt: '2026-09-22T12:00:00.000Z',
  error: null,
  ...overrides,
})

export const page = <T,>(items: T[], nextCursor: string | null = null) => ({ items, nextCursor })
export const infinite = <T,>(...pages: { items: T[]; nextCursor: string | null }[]) => ({ pages, pageParams: pages.map((_, i) => (i === 0 ? null : `p${i}`)) })


export const stage = (overrides: Partial<Stage> = {}): Stage => ({
  id: 's1',
  pipelineId: 'p1',
  name: 'Novo',
  color: 'gray',
  kind: 'open',
  position: 0,
  ...overrides,
})

export const lead = (overrides: Partial<Lead> = {}): Lead => ({
  id: 'l1',
  pipelineId: 'p1',
  stageId: 's1',
  position: 0,
  title: null,
  valueCents: null,
  assignee: null,
  lostReason: null,
  stageEnteredAt: '2026-09-22T12:00:00.000Z',
  createdAt: '2026-09-22T12:00:00.000Z',
  contact: { id: 'ct1', phone: '5511987654321', name: 'Carla Mendes', avatarUrl: null },
  conversationId: 'c1',
  unreadCount: 0,
  ...overrides,
})

export const boardStage = (overrides: Partial<Stage> & { leads?: Lead[] } = {}, extra: Partial<BoardStage> = {}): BoardStage => {
  const leads = overrides.leads ?? []
  return {
    ...stage(overrides),
    leadCount: leads.length,
    valueTotalCents: leads.reduce((sum, l) => sum + (l.valueCents ?? 0), 0),
    leads,
    nextCursor: null,
    ...extra,
  }
}

export const board = (stages: BoardStage[]): Board => ({
  pipeline: { id: 'p1', name: 'Vendas', isEntry: true, archivedAt: null, stages: stages.map(({ leads: _l, leadCount: _c, valueTotalCents: _v, nextCursor: _n, ...s }) => s) },
  stages,
})
