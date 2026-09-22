import { describe, expect, it } from 'vitest'
import {
  acceptedSlots,
  acceptsField,
  changeVisualType,
  defaultAggregation,
  defaultGrain,
  isVisualReady,
  mergeFieldIntoVisual,
  placeField,
  suggestVisualForField,
} from './slots'
import { makeVisual } from './test-helpers'

const S = 'internal:messages'
const ref = (field: string) => ({ sourceId: S, field })

describe('acceptedSlots', () => {
  it.each([
    ['kpi', ['value']],
    ['bar', ['category', 'value', 'legend']],
    ['line', ['category', 'value', 'legend']],
    ['pie', ['category', 'value']],
    ['funnel', ['category', 'value']],
    ['table', ['category', 'value']],
    ['pivot', ['category', 'value', 'columns']],
    ['filter_list', ['category']],
    ['filter_date', ['category']],
    ['text', []],
  ] as const)('%s → %j', (type, slots) => expect(acceptedSlots(type)).toEqual(slots))
})

describe('acceptsField', () => {
  it('filter_date category only takes dates', () => {
    expect(acceptsField('filter_date', 'category', { type: 'date' })).toBe(true)
    expect(acceptsField('filter_date', 'category', { type: 'datetime' })).toBe(true)
    expect(acceptsField('filter_date', 'category', { type: 'text' })).toBe(false)
  })
  it('kpi value takes any type (count)', () => expect(acceptsField('kpi', 'value', { type: 'text' })).toBe(true))
  it('line category takes text too', () => expect(acceptsField('line', 'category', { type: 'text' })).toBe(true))
  it('rejects slots the type does not have', () => expect(acceptsField('kpi', 'category', { type: 'text' })).toBe(false))
})

describe('defaults', () => {
  it('sum for number/currency, count otherwise', () => {
    expect(defaultAggregation('number')).toBe('sum')
    expect(defaultAggregation('currency')).toBe('sum')
    expect(defaultAggregation('text')).toBe('count')
    expect(defaultAggregation('date')).toBe('count')
  })
  it('month grain', () => expect(defaultGrain()).toBe('month'))
})

describe('placeField', () => {
  it('value gets the default aggregation', () =>
    expect(placeField(makeVisual({ slots: {} }), 'value', ref('amount'), 'currency').slots.value).toEqual([{ ...ref('amount'), aggregation: 'sum' }]))
  it('date category gets month grain', () =>
    expect(placeField(makeVisual(), 'category', ref('sentAt'), 'datetime').slots.category).toEqual([{ ...ref('sentAt'), dateGrain: 'month' }]))
  it('replaces the last entry when the slot is full', () => {
    const v = makeVisual({ type: 'pie', slots: { category: [ref('a')] } })
    expect(placeField(v, 'category', ref('b'), 'text').slots.category).toEqual([ref('b')])
  })
  it('ignores a legend while there are several values', () => {
    const v = makeVisual({ slots: { value: [ref('a'), ref('b')] } })
    expect(placeField(v, 'legend', ref('c'), 'text')).toBe(v)
  })
})

describe('suggestVisualForField', () => {
  it('number → kpi sum', () =>
    expect(suggestVisualForField(ref('amount'), 'number')).toMatchObject({ type: 'kpi', slots: { value: [{ field: 'amount', aggregation: 'sum' }] } }))
  it('date → line by month counting', () =>
    expect(suggestVisualForField(ref('sentAt'), 'date')).toMatchObject({
      type: 'line',
      slots: { category: [{ field: 'sentAt', dateGrain: 'month' }], value: [{ aggregation: 'count' }] },
    }))
  it('text with ≤ 6 values → donut', () => expect(suggestVisualForField(ref('status'), 'text', 6).type).toBe('donut'))
  it('text with > 6 values → bar limit 20', () =>
    expect(suggestVisualForField(ref('agent'), 'text', 7)).toMatchObject({ type: 'bar', options: { limit: 20 } }))
})

describe('mergeFieldIntoVisual', () => {
  it('date into bar with a number → line', () => {
    const v = makeVisual({ type: 'bar', slots: { value: [{ ...ref('amount'), aggregation: 'sum' }] } })
    expect(mergeFieldIntoVisual(v, ref('sentAt'), 'date')).toMatchObject({ type: 'line', slots: { category: [{ field: 'sentAt' }] } })
  })
  it('number into column with a date category → line', () => {
    const v = makeVisual({ type: 'column', slots: { category: [{ ...ref('sentAt'), dateGrain: 'month' }] } })
    expect(mergeFieldIntoVisual(v, ref('amount'), 'number')).toMatchObject({ type: 'line', slots: { value: [{ field: 'amount' }] } })
  })
  it('text into kpi → bar', () => {
    const v = makeVisual({ type: 'kpi', slots: { value: [{ ...ref('amount'), aggregation: 'sum' }] } })
    expect(mergeFieldIntoVisual(v, ref('agent'), 'text')).toMatchObject({ type: 'bar', slots: { category: [ref('agent')] } })
  })
  it('otherwise fills the next free slot', () => {
    const v = makeVisual({ type: 'bar', slots: { category: [ref('agent')] } })
    expect(mergeFieldIntoVisual(v, ref('amount'), 'number').slots.value).toEqual([{ ...ref('amount'), aggregation: 'sum' }])
    expect(mergeFieldIntoVisual(v, ref('status'), 'text').slots.legend).toEqual(ref('status'))
  })
  it('pivot: second text field goes to columns', () => {
    const v = makeVisual({ type: 'pivot', slots: { category: [ref('agent')] } })
    expect(mergeFieldIntoVisual(v, ref('status'), 'text').slots.columns).toEqual(ref('status'))
  })
})

describe('changeVisualType', () => {
  it('keeps what fits and returns the excess as pending', () => {
    const v = makeVisual({ type: 'table', slots: { category: [ref('a'), ref('b')], value: [ref('x'), ref('y')] } })
    const { visual, pendingFields } = changeVisualType(v, 'pie')
    expect(visual).toMatchObject({ type: 'pie', slots: { category: [ref('a')], value: [ref('x')] } })
    expect(pendingFields).toEqual([ref('b'), ref('y')])
  })
  it('turns pivot columns into a legend', () => {
    const v = makeVisual({ type: 'pivot', slots: { category: [ref('a')], value: [ref('x')], columns: ref('c') } })
    expect(changeVisualType(v, 'column').visual.slots).toEqual({ category: [ref('a')], value: [ref('x')], legend: ref('c') })
  })
  it('drops non-date categories when becoming a period filter', () => {
    const v = makeVisual({ type: 'bar', slots: { category: [ref('agent')], value: [ref('x')] } })
    const result = changeVisualType(v, 'filter_date')
    expect(result.visual.slots).toEqual({})
    expect(result.pendingFields).toEqual([ref('agent'), ref('x')])
  })
})

describe('isVisualReady', () => {
  const c = [ref('a')]
  const val = [ref('x')]
  it.each([
    ['kpi', {}, false],
    ['kpi', { value: val }, true],
    ['bar', { category: c }, false],
    ['bar', { category: c, value: val }, true],
    ['donut', { category: c, value: val }, true],
    ['table', { category: c }, true],
    ['table', {}, false],
    ['pivot', { category: c, value: val }, false],
    ['pivot', { category: c, value: val, columns: ref('b') }, true],
    ['filter_list', { category: c }, true],
    ['filter_date', {}, false],
    ['text', {}, true],
  ] as const)('%s with %j → %s', (type, slots, ready) => expect(isVisualReady(makeVisual({ type, slots }))).toBe(ready))
})
