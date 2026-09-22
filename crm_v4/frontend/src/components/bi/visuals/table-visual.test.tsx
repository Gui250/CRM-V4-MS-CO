import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { makeVisual } from '@/lib/bi/test-helpers'
import type { QueryResult } from '@/lib/bi/types'
import { TableVisual } from './table-visual'

const visual = makeVisual({ type: 'table', slots: { category: [{ sourceId: 's', field: 'agent' }], value: [{ sourceId: 's', field: 'value', aggregation: 'sum' }] } })
const result: QueryResult = {
  columns: [{ key: 'agent', label: 'Atendente', type: 'text' }, { key: 'value', label: 'Valor', type: 'currency' }],
  rows: [['Bia', 10], ['Ana', 30], ['Caio', 20]],
  dataAsOf: '',
  staleWarning: null,
  missingFields: [],
}

const firstColumn = () => screen.getAllByRole('row').slice(1).map((r) => within(r).getAllByRole('cell')[0]!.textContent)

describe('TableVisual', () => {
  it('sorts by a header, then reverses', async () => {
    render(<TableVisual visual={visual} result={result} title="Valores" />)
    const header = screen.getByRole('button', { name: /Valor/ })
    await userEvent.click(header)
    expect(firstColumn()).toEqual(['Bia', 'Caio', 'Ana'])
    expect(screen.getByRole('columnheader', { name: /Valor/ })).toHaveAttribute('aria-sort', 'ascending')
    await userEvent.click(header)
    expect(firstColumn()).toEqual(['Ana', 'Caio', 'Bia'])
  })

  it('formats measures as currency', () => {
    render(<TableVisual visual={visual} result={result} title="Valores" />)
    expect(screen.getByText(/R\$\s30,00/)).toBeInTheDocument()
  })
})
