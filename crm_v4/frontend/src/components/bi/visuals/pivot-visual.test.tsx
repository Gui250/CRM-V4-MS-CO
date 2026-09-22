import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { makeVisual } from '@/lib/bi/test-helpers'
import type { QueryResult } from '@/lib/bi/types'
import { pivot } from './pivot'
import { PivotVisual } from './pivot-visual'

const S = 's'
const visual = makeVisual({
  type: 'pivot',
  sourceId: S,
  slots: { category: [{ sourceId: S, field: 'agent' }], columns: { sourceId: S, field: 'status' }, value: [{ sourceId: S, field: 'id', aggregation: 'count' }] },
  options: { limit: 20, crossFilter: true, numberFormat: 'integer' },
})
const result: QueryResult = {
  columns: [
    { key: 'agent', label: 'Atendente', type: 'text' },
    { key: 'status', label: 'Status', type: 'text' },
    { key: 'id', label: 'Conversas', type: 'number' },
  ],
  rows: [
    ['Ana', 'aberta', 2],
    ['Ana', 'fechada', 3],
    ['Bia', 'fechada', 4],
  ],
  dataAsOf: '2026-09-22T12:00:00.000Z',
  staleWarning: null,
  missingFields: [],
}

describe('pivot', () => {
  it('builds rows × columns with totals', () => {
    const table = pivot(result.rows, 1)
    expect(table.columns).toEqual(['aberta', 'fechada'])
    expect(table.rows).toEqual([
      { keys: ['Ana'], cells: [2, 3], total: 5 },
      { keys: ['Bia'], cells: [null, 4], total: 4 },
    ])
    expect(table.columnTotals).toEqual([2, 7])
    expect(table.grandTotal).toBe(9)
    expect(table.truncated).toBe(false)
  })

  it('keeps at most the column limit and says it truncated', () => {
    const rows = Array.from({ length: 5 }, (_, i) => ['Ana', `c${i}`, 1])
    const table = pivot(rows, 1, 3)
    expect(table.columns).toEqual(['c0', 'c1', 'c2'])
    expect(table.rows[0]!.total).toBe(3)
    expect(table.truncated).toBe(true)
  })
})

describe('PivotVisual', () => {
  it('renders the matrix with row and column totals', () => {
    render(<PivotVisual visual={visual} result={result} title="Conversas" />)
    const table = screen.getByRole('table', { name: 'Conversas' })
    expect(within(table).getAllByRole('columnheader').map((th) => th.textContent)).toEqual(['Atendente', 'aberta', 'fechada', 'Total'])
    const ana = within(table).getByRole('row', { name: /Ana/ })
    expect(within(ana).getAllByRole('cell').map((td) => td.textContent)).toEqual(['2', '3', '5'])
    const totals = within(table).getAllByRole('row').at(-1)!
    expect(within(totals).getAllByRole('cell').map((td) => td.textContent)).toEqual(['2', '7', '9'])
  })

  it('notes when columns were cut at 50', () => {
    const many = { ...result, rows: Array.from({ length: 51 }, (_, i) => ['Ana', `s${String(i).padStart(2, '0')}`, 1]) }
    render(<PivotVisual visual={visual} result={many} title="Conversas" />)
    expect(screen.getByText('Mostrando as primeiras 50 colunas.')).toBeInTheDocument()
  })
})
