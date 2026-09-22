import { describe, expect, it } from 'vitest'
import { buildFilterOptionsQuery, buildQuery, type BuildContext } from './build-query'
import { makeDefinition, makePage, makeVisual } from './test-helpers'
import type { Filter, Visual } from './types'
import { emptyViewState, viewReducer } from './view-state'

const S = 'internal:messages'
const L = 'internal:leads'
const agent = { sourceId: S, field: 'agent' }
const count = { sourceId: S, field: 'id', aggregation: 'count' as const }
const sentAt = { sourceId: S, field: 'sentAt', dateGrain: 'month' as const }

const ctx = (partial: Partial<BuildContext> = {}): BuildContext => ({ page: makePage(), definition: makeDefinition(), ...partial })
const bar = makeVisual({ id: 'bar', slots: { category: [agent], value: [count] } })

describe('buildQuery: slots', () => {
  it('returns null when the visual is not ready', () => expect(buildQuery(makeVisual({ slots: { category: [agent] } }), ctx())).toBeNull())
  it('returns null for text and period filters', () => {
    expect(buildQuery(makeVisual({ type: 'text', sourceId: undefined }), ctx())).toBeNull()
    expect(buildQuery(makeVisual({ type: 'filter_date', slots: { category: [sentAt] } }), ctx())).toBeNull()
  })
  it('category → dimensions, value → measures', () =>
    expect(buildQuery(bar, ctx())).toEqual({ sourceId: S, dimensions: [agent], measures: [count], filters: [], calculatedFields: [], limit: 20, groupOthers: true }))
  it('fills a missing aggregation with count', () =>
    expect(buildQuery(makeVisual({ slots: { category: [agent], value: [{ sourceId: S, field: 'x' }] } }), ctx())?.measures).toEqual([
      { sourceId: S, field: 'x', aggregation: 'count' },
    ]))
  it('legend → second dimension', () => {
    const status = { sourceId: S, field: 'status' }
    expect(buildQuery(makeVisual({ slots: { category: [agent], value: [count], legend: status } }), ctx())?.dimensions).toEqual([agent, status])
  })
  it('pivot rows + columns, no Outros group', () => {
    const status = { sourceId: S, field: 'status' }
    const q = buildQuery(makeVisual({ type: 'pivot', slots: { category: [agent], value: [count], columns: status } }), ctx())
    expect(q).toMatchObject({ dimensions: [agent, status], groupOthers: false })
  })
  it('table does not group others', () =>
    expect(buildQuery(makeVisual({ type: 'table', slots: { category: [agent] } }), ctx())?.groupOthers).toBe(false))
  it('line over dates: no Outros, chronological by default', () =>
    expect(buildQuery(makeVisual({ type: 'line', slots: { category: [sentAt], value: [count] } }), ctx())).toMatchObject({
      groupOthers: false,
      sort: { by: 'category', dir: 'asc' },
    }))
  it('limit and sort come from options', () => {
    const v = makeVisual({ slots: { category: [agent], value: [count] }, options: { limit: 5, crossFilter: true, sort: { by: 'value', dir: 'desc' } } })
    expect(buildQuery(v, ctx())).toMatchObject({ limit: 5, sort: { by: 'value', dir: 'desc' } })
  })
  it('copies only the calculated fields referenced', () => {
    const calc = { id: 'c1', name: 'Ticket', expression: '[amount] / 2', sourceId: S }
    const other = { ...calc, id: 'c2' }
    const v = makeVisual({ slots: { category: [agent], value: [{ sourceId: S, field: 'calc:c1', aggregation: 'sum' }] } })
    expect(buildQuery(v, ctx({ definition: makeDefinition({ calculatedFields: [calc, other] }) }))?.calculatedFields).toEqual([calc])
  })
})

describe('buildQuery: filters', () => {
  const pageFilter: Filter = { sourceId: S, field: 'status', op: 'in', values: ['open'] }
  const q = (visual: Visual, partial: Partial<BuildContext>) => buildQuery(visual, ctx(partial))?.filters

  it('applies page filters', () => expect(q(bar, { page: makePage({ filters: [pageFilter] }) })).toEqual([pageFilter]))
  it('view overrides replace the page filter by index', () => {
    const override = { ...pageFilter, values: ['closed'] }
    const view = viewReducer(emptyViewState(), { type: 'overridePageFilter', index: 0, filter: override })
    expect(q(bar, { page: makePage({ filters: [pageFilter] }), view })).toEqual([override])
  })
  it('skips empty list filters (nothing selected = everything)', () =>
    expect(q(bar, { page: makePage({ filters: [{ ...pageFilter, values: [] }] }) })).toEqual([]))
  it('applies a cross-filter from another visual but not to its origin', () => {
    const view = viewReducer(emptyViewState(), {
      type: 'toggleCrossFilter',
      crossFilter: { visualId: 'other', sourceId: S, field: 'agent', op: 'in', values: ['Ana'] },
    })
    expect(q(bar, { view })).toEqual([{ sourceId: S, field: 'agent', op: 'in', values: ['Ana'] }])
    expect(q({ ...bar, id: 'other' }, { view })).toEqual([])
  })
  it('drill replaces the grain and adds the bucket between', () => {
    const v = makeVisual({ id: 'v2', type: 'column', slots: { category: [{ ...sentAt, dateGrain: 'year' }], value: [count] } })
    const view = viewReducer(emptyViewState(), { type: 'drillDown', visualId: 'v2', fromGrain: 'year', bucket: '2026-01-01T03:00:00.000Z' })
    expect(buildQuery(v, ctx({ view }))).toMatchObject({
      dimensions: [{ field: 'sentAt', dateGrain: 'quarter' }],
      filters: [{ sourceId: S, field: 'sentAt', op: 'between', values: ['2026-01-01T03:00:00.000Z', '2027-01-01T02:59:59.999Z'] }],
    })
  })
  it('drops filters from unrelated sources', () =>
    expect(q(bar, { page: makePage({ filters: [{ ...pageFilter, sourceId: L }] }) })).toEqual([]))
  it('keeps filters from a related source (either direction)', () => {
    const leadFilter = { ...pageFilter, sourceId: L }
    const rel = { id: 'r', leftSourceId: L, leftField: 'phone', rightSourceId: S, rightField: 'phone' }
    expect(q(bar, { page: makePage({ filters: [leadFilter] }), relationships: [rel] })).toEqual([leadFilter])
    const reversed = { ...rel, leftSourceId: S, rightSourceId: L }
    expect(q(bar, { page: makePage({ filters: [leadFilter] }), relationships: [reversed] })).toEqual([leadFilter])
  })
})

describe('buildFilterOptionsQuery', () => {
  it('distinct values with count, up to 200', () =>
    expect(buildFilterOptionsQuery(makeVisual({ type: 'filter_list', slots: { category: [agent] } }))).toEqual({
      sourceId: S,
      dimensions: [agent],
      measures: [{ ...agent, aggregation: 'count' }],
      filters: [],
      calculatedFields: [],
      sort: { by: 'category', dir: 'asc' },
      limit: 200,
      groupOthers: false,
    }))
  it('buildQuery delegates for filter_list', () =>
    expect(buildQuery(makeVisual({ type: 'filter_list', slots: { category: [agent] } }), ctx())?.limit).toBe(200))
})
