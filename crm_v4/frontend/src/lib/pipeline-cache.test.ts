import { describe, expect, it } from 'vitest'
import { board, boardStage, lead } from '@/test/fixtures'
import { applyLeadDelete, applyLeadUpsert, applyUnread, estimatePosition, NO_FILTER } from './pipeline-cache'

const twoColumns = () =>
  board([
    boardStage({ id: 's1', name: 'Novo', leads: [lead({ id: 'a', position: 0, valueCents: 100 }), lead({ id: 'b', position: 1024, valueCents: 200 })] }),
    boardStage({ id: 's2', name: 'Em contato', position: 1, leads: [lead({ id: 'c', stageId: 's2', position: 0 })] }),
  ])

const ids = (b: ReturnType<typeof twoColumns>, index: number) => b.stages[index]!.leads.map((l) => l.id)

describe('applyLeadUpsert', () => {
  it('moves a loaded card between columns and adjusts both totals', () => {
    const next = applyLeadUpsert(twoColumns(), lead({ id: 'a', stageId: 's2', position: 1024, valueCents: 100 }), { stageId: 's1', valueCents: 100 }, NO_FILTER)
    expect(ids(next, 0)).toEqual(['b'])
    expect(ids(next, 1)).toEqual(['c', 'a'])
    expect(next.stages[0]).toMatchObject({ leadCount: 1, valueTotalCents: 200 })
    expect(next.stages[1]).toMatchObject({ leadCount: 2, valueTotalCents: 100 })
  })

  it('does not count twice when the card is already in its target column (own optimistic move)', () => {
    const once = applyLeadUpsert(twoColumns(), lead({ id: 'a', stageId: 's2', position: 1024, valueCents: 100 }), { stageId: 's1', valueCents: 100 }, NO_FILTER)
    const twice = applyLeadUpsert(once, lead({ id: 'a', stageId: 's2', position: 2048, valueCents: 100 }), { stageId: 's1', valueCents: 100 }, NO_FILTER)
    expect(twice.stages.map((s) => s.leadCount)).toEqual([1, 2])
    expect(twice.stages[1]!.leads.find((l) => l.id === 'a')?.position).toBe(2048)
  })

  it('reorders within a column and applies a value change', () => {
    const next = applyLeadUpsert(twoColumns(), lead({ id: 'b', position: -1024, valueCents: 500 }), { stageId: 's1', valueCents: 200 }, NO_FILTER)
    expect(ids(next, 0)).toEqual(['b', 'a'])
    expect(next.stages[0]).toMatchObject({ leadCount: 2, valueTotalCents: 600 })
  })

  it('uses the previous snapshot for cards that were not loaded, and adds created leads', () => {
    const moved = applyLeadUpsert(twoColumns(), lead({ id: 'z', stageId: 's2', position: 5, valueCents: 50 }), { stageId: 's1', valueCents: 50 }, NO_FILTER)
    expect(moved.stages.map((s) => [s.leadCount, s.valueTotalCents])).toEqual([
      [1, 250],
      [2, 50],
    ])
    const created = applyLeadUpsert(twoColumns(), lead({ id: 'new', position: -2048 }), null, NO_FILTER)
    expect(ids(created, 0)).toEqual(['new', 'a', 'b'])
    expect(created.stages[0]!.leadCount).toBe(3)
  })

  it('keeps a card out of the loaded list when it belongs to an unloaded page', () => {
    const paged = board([boardStage({ id: 's1', leads: [lead({ id: 'a', position: 0 })] }, { nextCursor: 'more', leadCount: 10 })])
    const next = applyLeadUpsert(paged, lead({ id: 'far', position: 9999 }), null, NO_FILTER)
    expect(next.stages[0]!.leads.map((l) => l.id)).toEqual(['a'])
    expect(next.stages[0]!.leadCount).toBe(11)
  })

  it('drops cards that no longer match the filter and ignores other pipelines', () => {
    const filter = { assignee: 'u1', search: '' }
    const mine = board([boardStage({ id: 's1', leads: [lead({ id: 'a', assignee: { id: 'u1', name: 'Bia' } })] })])
    const reassigned = applyLeadUpsert(mine, lead({ id: 'a', assignee: null }), { stageId: 's1', valueCents: null }, filter)
    expect(reassigned.stages[0]).toMatchObject({ leads: [], leadCount: 0 })

    const searched = applyLeadUpsert(twoColumns(), lead({ id: 'x', contact: { id: 'k', phone: '5521', name: 'Rafael', avatarUrl: null } }), null, { assignee: '', search: 'carla' })
    expect(ids(searched, 0)).toEqual(['a', 'b'])

    const other = applyLeadUpsert(twoColumns(), lead({ id: 'o', pipelineId: 'p2' }), null, NO_FILTER)
    expect(other).toEqual(twoColumns())
  })
})

describe('applyLeadDelete and applyUnread', () => {
  it('removes a deleted card and decrements its column', () => {
    const next = applyLeadDelete(twoColumns(), { leadId: 'a', pipelineId: 'p1', stageId: 's1', valueCents: 100 }, NO_FILTER)
    expect(ids(next, 0)).toEqual(['b'])
    expect(next.stages[0]).toMatchObject({ leadCount: 1, valueTotalCents: 200 })
  })

  it('updates the unread badge of cards of that conversation', () => {
    const next = applyUnread(twoColumns(), 'c1', 4)
    expect(next.stages.flatMap((s) => s.leads).every((l) => l.unreadCount === 4)).toBe(true)
  })
})

describe('estimatePosition', () => {
  const cards = [lead({ id: 'a', position: 0 }), lead({ id: 'b', position: 1024 })]
  it('mirrors the server: midpoint, top, end, empty', () => {
    expect(estimatePosition(cards, 'b')).toBe(512)
    expect(estimatePosition(cards, 'a')).toBe(-1024)
    expect(estimatePosition(cards, null)).toBe(2048)
    expect(estimatePosition([], null)).toBe(0)
  })
})
