import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { makeDefinition, makePage, makeVisual } from '@/lib/bi/test-helpers'
import type { QueryResult } from '@/lib/bi/types'
import { emptyViewState, type PageViewState } from '@/lib/bi/view-state'
import { ReportScopeProvider, type ReportScope } from '../report-scope'
import { ChartVisual } from './chart-visual'

vi.mock('./echart', async () => ({ EChart: (await import('../test-utils')).FakeEChart }))

const S = 's'
const visual = makeVisual({
  id: 'line',
  type: 'line',
  sourceId: S,
  slots: { category: [{ sourceId: S, field: 'sent_at', dateGrain: 'year' }], value: [{ sourceId: S, field: 'id', aggregation: 'count' }] },
})
const result: QueryResult = {
  columns: [{ key: 'sent_at', label: 'Enviada em', type: 'datetime' }, { key: 'id', label: 'Conversas', type: 'number' }],
  rows: [['2025-01-01T03:00:00.000Z', 10], ['2026-01-01T03:00:00.000Z', 20]],
  dataAsOf: '',
  staleWarning: null,
  missingFields: [],
}

function setup(view: PageViewState = emptyViewState(), chart = visual) {
  const dispatchView = vi.fn()
  const scope: ReportScope = {
    definition: makeDefinition(),
    page: makePage({ visuals: [chart] }),
    view,
    dispatchView,
    sourcesById: {},
    relationships: [],
    setFilter: vi.fn(),
    openData: vi.fn(),
  }
  render(
    <ReportScopeProvider value={scope}>
      <ChartVisual visual={chart} result={result} title="Conversas por ano" />
    </ReportScopeProvider>,
  )
  return { dispatchView, user: userEvent.setup() }
}

describe('ChartVisual', () => {
  it('cross-filters on click', async () => {
    const { dispatchView, user } = setup()
    await user.click(screen.getByRole('img', { name: 'Linha: Conversas por ano' }))
    expect(dispatchView).toHaveBeenCalledWith({ type: 'toggleCrossFilter', crossFilter: expect.objectContaining({ visualId: 'line', field: 'sent_at', op: 'between', grain: 'year' }) })
  })

  it('does not cross-filter when the author turned it off', async () => {
    const { dispatchView, user } = setup(emptyViewState(), { ...visual, options: { ...visual.options, crossFilter: false } })
    await user.click(screen.getByRole('img'))
    expect(dispatchView).not.toHaveBeenCalled()
  })

  it('drills into a period picked from the list', async () => {
    const { dispatchView, user } = setup()
    await user.click(screen.getByRole('button', { name: 'Detalhar' }))
    await user.selectOptions(screen.getByRole('combobox', { name: 'Período para detalhar' }), '2026')
    expect(dispatchView).toHaveBeenCalledWith({ type: 'drillDown', visualId: 'line', fromGrain: 'year', bucket: '2026-01-01T03:00:00.000Z' })
  })

  it('drills on click while in drill mode', async () => {
    const { dispatchView, user } = setup()
    await user.click(screen.getByRole('button', { name: 'Detalhar' }))
    await user.click(screen.getByRole('img'))
    expect(dispatchView).toHaveBeenCalledWith(expect.objectContaining({ type: 'drillDown', bucket: '2025-01-01T03:00:00.000Z' }))
  })

  it('goes back one level', async () => {
    const drilled: PageViewState = { ...emptyViewState(), drill: { line: [{ from: 'year', grain: 'quarter', start: '2026-01-01T03:00:00.000Z', end: '2027-01-01T02:59:59.999Z' }] } }
    const { dispatchView, user } = setup(drilled)
    await user.click(screen.getByRole('button', { name: 'Voltar nível' }))
    expect(dispatchView).toHaveBeenCalledWith({ type: 'drillUp', visualId: 'line' })
  })
})
