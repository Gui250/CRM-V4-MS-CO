import { screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeVisual } from '@/lib/bi/test-helpers'
import type { QueryRequest, QueryResult } from '@/lib/bi/types'
import { mockApi, renderWithClient } from '@/test/render'
import { KpiVisual, previousPeriodRequest } from './kpi-visual'

afterEach(() => vi.unstubAllGlobals())

const between = { sourceId: 's', field: 'sent_at', op: 'between' as const, values: ['2026-09-01T03:00:00.000Z', '2026-09-11T02:59:59.999Z'] }
const request: QueryRequest = { sourceId: 's', dimensions: [], measures: [{ sourceId: 's', field: 'id', aggregation: 'count' }], filters: [between], calculatedFields: [], limit: 20, groupOthers: true }
const result = (n: number): QueryResult => ({ columns: [{ key: 'id', label: 'Conversas', type: 'number' }], rows: [[n]], dataAsOf: '', staleWarning: null, missingFields: [] })

describe('previousPeriodRequest', () => {
  it('shifts the date range back by its own length', () => {
    expect(previousPeriodRequest(request)?.filters[0]!.values).toEqual(['2026-08-22T03:00:00.000Z', '2026-09-01T02:59:59.999Z'])
  })

  it('is null without a date range', () => {
    expect(previousPeriodRequest({ ...request, filters: [] })).toBeNull()
  })
})

describe('KpiVisual', () => {
  it('shows the formatted number', () => {
    renderWithClient(<KpiVisual visual={makeVisual({ type: 'kpi' })} result={result(1234)} request={request} title="Conversas" />)
    expect(screen.getByLabelText('Conversas: 1.234')).toBeInTheDocument()
  })

  it('compares with the previous period when asked', async () => {
    mockApi({ 'POST /api/bi/query': () => ({ body: result(100) }) })
    const visual = makeVisual({ type: 'kpi', options: { limit: 20, crossFilter: true, compareWithPreviousPeriod: true } })
    renderWithClient(<KpiVisual visual={visual} result={result(125)} request={request} title="Conversas" />)
    expect(await screen.findByText('▲ 25% vs. período anterior')).toBeInTheDocument()
  })
})
