import { describe, expect, it } from 'vitest'
import { SERIES_COLORS } from './chart-theme'
import { seriesPointToValue, toChartOption } from './echarts-options'
import { makeVisual } from './test-helpers'
import type { QueryResult, Visual, VisualType } from './types'

const S = 'internal:messages'
const plain = (s: string) => s.replace(/\s/g, ' ')

const result = (rows: unknown[][], columns: QueryResult['columns']): QueryResult => ({
  columns,
  rows,
  dataAsOf: '2026-01-01T00:00:00Z',
  staleWarning: null,
  missingFields: [],
})
const agentResult = result(
  [
    ['Ana', 10],
    ['Outros', 3],
    ['Bia', 5],
  ],
  [
    { key: 'agent', label: 'Atendente', type: 'text' },
    { key: 'count', label: 'Mensagens', type: 'number' },
  ],
)
const visual = (type: VisualType, partial: Partial<Visual> = {}) =>
  makeVisual({ type, slots: { category: [{ sourceId: S, field: 'agent' }], value: [{ sourceId: S, field: 'id', aggregation: 'count' }] }, ...partial })

type AnyRecord = Record<string, unknown>
const series = (option: object) => (option as { series: AnyRecord[] }).series
const axis = (option: object, name: 'xAxis' | 'yAxis') => (option as Record<string, AnyRecord>)[name]!

describe('toChartOption', () => {
  it('column: categories on x, Outros last, aria on, brand palette', () => {
    const option = toChartOption(visual('column'), agentResult)
    expect(axis(option, 'xAxis')).toMatchObject({ type: 'category', data: ['Ana', 'Bia', 'Outros'] })
    expect(series(option)[0]).toMatchObject({ type: 'bar', name: 'Mensagens', data: [10, 5, 3] })
    expect(option.aria).toEqual({ enabled: true })
    expect(option.color).toEqual(SERIES_COLORS)
  })
  it('bar is horizontal with the first category on top', () => {
    const option = toChartOption(visual('bar'), agentResult)
    expect(axis(option, 'yAxis')).toMatchObject({ type: 'category', inverse: true })
    expect(axis(option, 'xAxis')).toMatchObject({ type: 'value' })
  })
  it('line and area', () => {
    expect(series(toChartOption(visual('line'), agentResult))[0]).toMatchObject({ type: 'line' })
    expect(series(toChartOption(visual('area'), agentResult))[0]).toHaveProperty('areaStyle')
  })
  it('date categories use the bucket label (drill grain wins)', () => {
    const v = visual('line', { slots: { category: [{ sourceId: S, field: 'sentAt', dateGrain: 'month' }], value: [] } })
    const r = result([['2026-01-01T03:00:00.000Z', 4]], [
      { key: 'sentAt', label: 'Enviada em', type: 'datetime' },
      { key: 'count', label: 'Mensagens', type: 'number' },
    ])
    expect(axis(toChartOption(v, r), 'xAxis')).toMatchObject({ data: ['jan/2026'] })
    expect(axis(toChartOption(v, r, {}, { dateGrain: 'day' }), 'xAxis')).toMatchObject({ data: ['01/01/2026'] })
  })
  it('pie and donut radius', () => {
    expect(series(toChartOption(visual('pie'), agentResult))[0]).toMatchObject({ type: 'pie', radius: '70%' })
    const donut = series(toChartOption(visual('donut'), agentResult))[0]!
    expect(donut).toMatchObject({ type: 'pie', radius: ['45%', '70%'] })
    expect(donut.data).toEqual([
      { name: 'Ana', value: 10 },
      { name: 'Bia', value: 5 },
      { name: 'Outros', value: 3 },
    ])
  })
  it('funnel sorted by value, descending', () => {
    const r = result([['Lead', 5], ['Venda', 1], ['Contato', 9]], agentResult.columns)
    expect((series(toChartOption(visual('funnel'), r))[0]!.data as { name: string }[]).map((d) => d.name)).toEqual(['Contato', 'Lead', 'Venda'])
  })
  it('legend splits into one series per legend value', () => {
    const v = visual('column', { slots: { ...visual('column').slots, legend: { sourceId: S, field: 'status' } } })
    const r = result(
      [
        ['Ana', 'aberta', 2],
        ['Ana', 'fechada', 3],
        ['Bia', 'fechada', 4],
      ],
      [
        { key: 'agent', label: 'Atendente', type: 'text' },
        { key: 'status', label: 'Status', type: 'text' },
        { key: 'count', label: 'Mensagens', type: 'number' },
      ],
    )
    const option = toChartOption(v, r)
    expect(series(option).map((s) => [s.name, s.data])).toEqual([
      ['aberta', [2, null]],
      ['fechada', [3, 4]],
    ])
    expect(option.legend).toMatchObject({ show: true })
  })
  it('tooltip and axis use the visual number format (FR-017)', () => {
    const option = toChartOption(visual('column', { options: { limit: 20, crossFilter: true, numberFormat: 'currency' } }), agentResult)
    const tooltip = option.tooltip as { valueFormatter: (v: number) => string }
    expect(plain(tooltip.valueFormatter(1234.5))).toBe('R$ 1.234,50')
    const formatter = (axis(option, 'yAxis').axisLabel as { formatter: (v: number) => string }).formatter
    expect(plain(formatter(10))).toBe('R$ 10,00')
  })
  it('dims everything but the cross-filtered value', () => {
    const data = series(toChartOption(visual('column'), agentResult, {}, { highlightValue: 'Bia' }))[0]!.data
    expect(data).toEqual([
      { value: 10, itemStyle: { opacity: 0.35 } },
      { value: 5, itemStyle: { opacity: 1 } },
      { value: 3, itemStyle: { opacity: 0.35 } },
    ])
  })
})

describe('seriesPointToValue', () => {
  it('maps dataIndex back to the raw category in display order', () => {
    expect(seriesPointToValue(visual('column'), agentResult, { dataIndex: 2 })).toBe('Outros')
    expect(seriesPointToValue(visual('column'), agentResult, { dataIndex: 1 })).toBe('Bia')
  })
  it('follows the funnel sort', () => {
    const r = result([['Lead', 5], ['Contato', 9]], agentResult.columns)
    expect(seriesPointToValue(visual('funnel'), r, { dataIndex: 0 })).toBe('Contato')
  })
  it('returns the ISO bucket for dates', () => {
    const v = visual('line', { slots: { category: [{ sourceId: S, field: 'sentAt', dateGrain: 'month' }], value: [] } })
    const r = result([['2026-01-01T03:00:00.000Z', 4]], [
      { key: 'sentAt', label: 'Enviada em', type: 'datetime' },
      { key: 'count', label: 'Mensagens', type: 'number' },
    ])
    expect(seriesPointToValue(v, r, { dataIndex: 0 })).toBe('2026-01-01T03:00:00.000Z')
  })
})
