import { describe, expect, it } from 'vitest'
import { makePage, makeVisual } from './test-helpers'
import type { Source } from './types'
import { crossFilterFor, effectiveGrain, emptyViewState, trailItems, viewReducer, type CrossFilter } from './view-state'

const S = 'internal:messages'
const cf = (value: string): CrossFilter => ({ visualId: 'v1', sourceId: S, field: 'agent', op: 'in', values: [value] })

const dateVisual = makeVisual({
  id: 'v2',
  type: 'column',
  slots: { category: [{ sourceId: S, field: 'sentAt', dateGrain: 'year' }], value: [{ sourceId: S, field: 'id', aggregation: 'count' }] },
})

describe('viewReducer', () => {
  it('toggleCrossFilter sets, replaces and clears on the same value', () => {
    let s = viewReducer(emptyViewState(), { type: 'toggleCrossFilter', crossFilter: cf('Ana') })
    expect(s.crossFilter?.values).toEqual(['Ana'])
    s = viewReducer(s, { type: 'toggleCrossFilter', crossFilter: cf('Bia') })
    expect(s.crossFilter?.values).toEqual(['Bia'])
    s = viewReducer(s, { type: 'toggleCrossFilter', crossFilter: cf('Bia') })
    expect(s.crossFilter).toBeUndefined()
  })

  it('drillDown pushes year → quarter → month with the bucket range', () => {
    let s = viewReducer(emptyViewState(), { type: 'drillDown', visualId: 'v2', fromGrain: 'year', bucket: '2026-01-01T03:00:00.000Z' })
    s = viewReducer(s, { type: 'drillDown', visualId: 'v2', fromGrain: 'quarter', bucket: '2026-04-01T03:00:00.000Z' })
    expect(s.drill.v2).toEqual([
      { from: 'year', grain: 'quarter', start: '2026-01-01T03:00:00.000Z', end: '2027-01-01T02:59:59.999Z' },
      { from: 'quarter', grain: 'month', start: '2026-04-01T03:00:00.000Z', end: '2026-07-01T02:59:59.999Z' },
    ])
    expect(effectiveGrain(dateVisual, s)).toBe('month')
  })

  it('drillDown from day does nothing', () => {
    const s = emptyViewState()
    expect(viewReducer(s, { type: 'drillDown', visualId: 'v2', fromGrain: 'day', bucket: '2026-01-01T03:00:00.000Z' })).toBe(s)
  })

  it('drillUp pops one level and removes the entry when empty', () => {
    let s = viewReducer(emptyViewState(), { type: 'drillDown', visualId: 'v2', fromGrain: 'year', bucket: '2026-01-01T03:00:00.000Z' })
    s = viewReducer(s, { type: 'drillUp', visualId: 'v2' })
    expect(s.drill).toEqual({})
  })

  it('overridePageFilter stores by index', () => {
    const filter = { sourceId: S, field: 'agent', op: 'in' as const, values: ['Ana'] }
    expect(viewReducer(emptyViewState(), { type: 'overridePageFilter', index: 0, filter }).overrides).toEqual({ 0: filter })
  })

  it('removeTrailItem removes each kind', () => {
    const filter = { sourceId: S, field: 'agent', op: 'in' as const, values: ['Ana'] }
    let s = viewReducer(emptyViewState(), { type: 'overridePageFilter', index: 0, filter })
    s = viewReducer(s, { type: 'toggleCrossFilter', crossFilter: cf('Ana') })
    s = viewReducer(s, { type: 'drillDown', visualId: 'v2', fromGrain: 'year', bucket: '2026-01-01T03:00:00.000Z' })
    s = viewReducer(s, { type: 'drillDown', visualId: 'v2', fromGrain: 'quarter', bucket: '2026-01-01T03:00:00.000Z' })
    s = viewReducer(s, { type: 'removeTrailItem', id: 'override:0' })
    s = viewReducer(s, { type: 'removeTrailItem', id: 'crossFilter' })
    s = viewReducer(s, { type: 'removeTrailItem', id: 'drill:v2:1' })
    expect(s).toMatchObject({ overrides: {}, drill: { v2: [{ from: 'year' }] } })
    expect(s.crossFilter).toBeUndefined()
  })

  it('clearAll resets', () => {
    const s = viewReducer(emptyViewState(), { type: 'toggleCrossFilter', crossFilter: cf('Ana') })
    expect(viewReducer(s, { type: 'clearAll' })).toEqual(emptyViewState())
  })
})

describe('crossFilterFor', () => {
  it('exact value → in', () => {
    const v = makeVisual({ slots: { category: [{ sourceId: S, field: 'agent' }] } })
    expect(crossFilterFor(v, 'Ana')).toEqual({ visualId: 'v1', sourceId: S, field: 'agent', op: 'in', values: ['Ana'] })
  })
  it('date bucket → between of the bucket', () =>
    expect(crossFilterFor(dateVisual, '2026-01-01T03:00:00.000Z')).toMatchObject({
      op: 'between',
      grain: 'year',
      values: ['2026-01-01T03:00:00.000Z', '2027-01-01T02:59:59.999Z'],
    }))
})

describe('trailItems', () => {
  const source: Source = {
    id: S,
    name: 'Mensagens',
    kind: 'internal',
    refreshInterval: 'manual',
    lastRefreshedAt: null,
    lastAttemptAt: null,
    lastError: null,
    isRefreshing: false,
    fields: [
      { key: 'agent', label: 'Atendente', type: 'text', detectedType: 'text', invalidCount: 0 },
      { key: 'sentAt', label: 'Enviada em', type: 'datetime', detectedType: 'datetime', invalidCount: 0 },
    ],
  }
  it('labels overrides, cross-filter and drill levels in pt-BR', () => {
    let s = viewReducer(emptyViewState(), { type: 'overridePageFilter', index: 2, filter: { sourceId: S, field: 'agent', op: 'in', values: ['Ana', 'Bia'] } })
    s = viewReducer(s, { type: 'toggleCrossFilter', crossFilter: crossFilterFor(dateVisual, '2026-01-01T03:00:00.000Z')! })
    s = viewReducer(s, { type: 'drillDown', visualId: 'v2', fromGrain: 'month', bucket: '2026-01-10T03:00:00.000Z' })
    expect(trailItems(s, makePage({ visuals: [dateVisual] }), { [S]: source })).toEqual([
      { id: 'override:2', kind: 'override', label: 'Atendente: Ana, Bia' },
      { id: 'crossFilter', kind: 'crossFilter', label: 'Enviada em: 2026' },
      { id: 'drill:v2:0', kind: 'drill', label: 'Enviada em: jan/2026' },
    ])
  })
})
