import { fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeDefinition, makePage, makeVisual } from '@/lib/bi/test-helpers'
import type { Visual } from '@/lib/bi/types'
import { emptyViewState } from '@/lib/bi/view-state'
import { renderWithClient } from '@/test/render'
import { FIELD_MIME, VISUAL_MIME } from './field-meta'
import { ReportCanvas } from './report-canvas'
import { ReportScopeProvider, type ReportScope } from './report-scope'
import { SOURCE_ID, bodiesOf, messagesSource, mockBiApi } from './test-utils'

vi.mock('./visuals/echart', async () => ({ EChart: (await import('./test-utils')).FakeEChart }))

afterEach(() => vi.unstubAllGlobals())

function transfer(data: Record<string, string>) {
  return { types: Object.keys(data), getData: (type: string) => data[type] ?? '' }
}

const fieldDrop = (field: string, type: string) => transfer({ [FIELD_MIME]: JSON.stringify({ sourceId: SOURCE_ID, field, type }) })

function setup(visuals: Visual[] = []) {
  const dispatch = vi.fn()
  const page = makePage({ visuals })
  const scope: ReportScope = {
    definition: makeDefinition({ pages: [page] }),
    page,
    view: emptyViewState(),
    dispatchView: vi.fn(),
    sourcesById: { [SOURCE_ID]: messagesSource },
    relationships: [],
    setFilter: vi.fn(),
    openData: vi.fn(),
    editing: { onRemove: vi.fn(), onProperties: vi.fn(), onChangeType: vi.fn() },
  }
  renderWithClient(
    <ReportScopeProvider value={scope}>
      <ReportCanvas visuals={visuals} selectedVisualId={null} pickedSourceId={SOURCE_ID} pendingFields={{}} dispatch={dispatch} emptyState={<p>vazio</p>} />
    </ReportScopeProvider>,
  )
  return { dispatch, canvas: screen.getByRole('region', { name: 'Tela do relatório' }) }
}

describe('ReportCanvas', () => {
  it('creates a visual of the dragged palette type', () => {
    mockBiApi()
    const { dispatch, canvas } = setup()
    fireEvent.drop(canvas, { dataTransfer: transfer({ [VISUAL_MIME]: 'pie' }) })
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'addVisual', visualType: 'pie', sourceId: SOURCE_ID }))
  })

  it('turns a dropped number field into a filled KPI', async () => {
    const fetchMock = mockBiApi()
    const { dispatch, canvas } = setup()
    fireEvent.drop(canvas, { dataTransfer: fieldDrop('value', 'currency') })
    await waitFor(() =>
      expect(dispatch).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'addVisual', visualType: 'kpi', slots: { value: [{ sourceId: SOURCE_ID, field: 'value', aggregation: 'sum' }] } }),
      ),
    )
    expect(bodiesOf(fetchMock, 'POST /api/bi/query')).toEqual([])
  })

  it('turns a text field with few values into a donut after counting them', async () => {
    const fetchMock = mockBiApi()
    const { dispatch, canvas } = setup()
    fireEvent.drop(canvas, { dataTransfer: fieldDrop('agent', 'text') })
    await waitFor(() => expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'addVisual', visualType: 'donut' })))
    expect(bodiesOf(fetchMock, 'POST /api/bi/query')[0]).toMatchObject({ dimensions: [{ field: 'agent' }], limit: 7, groupOthers: false })
  })

  it('turns a text field with many values into a bar chart', async () => {
    const rows = Array.from({ length: 7 }, (_, i) => [`v${i}`, 1])
    mockBiApi({ 'POST /api/bi/query': () => ({ body: { columns: [], rows, dataAsOf: '', staleWarning: null, missingFields: [] } }) })
    const { dispatch, canvas } = setup()
    fireEvent.drop(canvas, { dataTransfer: fieldDrop('status', 'text') })
    await waitFor(() => expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'addVisual', visualType: 'bar', options: expect.objectContaining({ limit: 20 }) })))
  })

  it('turns a column chart into a line when a date field is dropped on it', () => {
    mockBiApi()
    const column = makeVisual({
      id: 'c1',
      type: 'column',
      slots: { category: [{ sourceId: SOURCE_ID, field: 'agent' }], value: [{ sourceId: SOURCE_ID, field: 'value', aggregation: 'sum' }] },
    })
    const { dispatch } = setup([column])
    fireEvent.drop(screen.getByRole('group', { name: 'Componente Soma de Valor por Atendente' }), { dataTransfer: fieldDrop('sent_at', 'datetime') })
    expect(dispatch).toHaveBeenCalledWith({
      type: 'replaceVisual',
      visual: expect.objectContaining({ type: 'line', slots: expect.objectContaining({ category: [{ sourceId: SOURCE_ID, field: 'sent_at', dateGrain: 'month' }] }) }),
    })
    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'addVisual' }))
  })

  it('shows "Outros" in a chart whose category has more values than the limit', async () => {
    mockBiApi({
      'POST /api/bi/query': () => ({
        body: { columns: [{ key: 'agent', label: 'Atendente', type: 'text' }, { key: 'n', label: 'n', type: 'number' }], rows: [['Ana', 5], ['Outros', 9]], dataAsOf: '', staleWarning: null, missingFields: [] },
      }),
    })
    setup([makeVisual({ id: 'b', type: 'bar', slots: { category: [{ sourceId: SOURCE_ID, field: 'agent' }], value: [{ sourceId: SOURCE_ID, field: 'n', aggregation: 'count' }] } })])
    const chart = await screen.findByRole('img', { name: /Barras/ })
    expect(chart.dataset.option).toContain('Outros')
  })
})
