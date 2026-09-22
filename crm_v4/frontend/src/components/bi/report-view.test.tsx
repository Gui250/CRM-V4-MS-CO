import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeDefinition, makePage, makeVisual } from '@/lib/bi/test-helpers'
import type { Filter, QueryRequest } from '@/lib/bi/types'
import { renderWithClient } from '@/test/render'
import { ReportView } from './report-view'
import { SOURCE_ID, bodiesOf, mockBiApi } from './test-utils'

vi.mock('./visuals/echart', async () => ({ EChart: (await import('./test-utils')).FakeEChart }))

afterEach(() => vi.unstubAllGlobals())

const ref = (field: string) => ({ sourceId: SOURCE_ID, field })
const count = (field: string) => ({ sourceId: SOURCE_ID, field, aggregation: 'count' as const })

const definition = makeDefinition({
  pages: [
    makePage({
      visuals: [
        makeVisual({ id: 'list', type: 'filter_list', title: 'Atendentes', layout: { x: 0, y: 0, w: 3, h: 2 }, slots: { category: [ref('agent')] } }),
        makeVisual({ id: 'period', type: 'filter_date', title: 'Período', layout: { x: 3, y: 0, w: 3, h: 2 }, slots: { category: [{ ...ref('sent_at'), dateGrain: 'day' }] } }),
        makeVisual({ id: 'bar', type: 'bar', title: 'Por atendente', layout: { x: 0, y: 2, w: 6, h: 4 }, slots: { category: [ref('agent')], value: [count('agent')] } }),
        makeVisual({ id: 'col', type: 'column', title: 'Por status', layout: { x: 6, y: 2, w: 6, h: 4 }, slots: { category: [ref('status')], value: [count('status')] } }),
      ],
    }),
  ],
})

const queriesOf = (fetchMock: ReturnType<typeof mockBiApi>, field: string) =>
  (bodiesOf(fetchMock, 'POST /api/bi/query') as QueryRequest[]).filter((q) => q.dimensions[0]?.field === field && q.limit !== 200)

const hasFilter = (queries: QueryRequest[], match: Partial<Filter>) => queries.some((q) => q.filters.some((f) => Object.entries(match).every(([k, v]) => JSON.stringify(f[k as keyof Filter]) === JSON.stringify(v))))

function setup() {
  const fetchMock = mockBiApi()
  const utils = renderWithClient(<ReportView reportName="Atendimento" definition={definition} />)
  return { fetchMock, ...utils }
}

describe('ReportView', () => {
  it('filters the other visuals from a list filter', async () => {
    const { user, fetchMock } = setup()
    const list = await screen.findByRole('group', { name: 'Atendentes' })
    await user.click(await within(list).findByRole('checkbox', { name: /Ana/ }))
    await waitFor(() => expect(hasFilter(queriesOf(fetchMock, 'status'), { field: 'agent', op: 'in', values: ['Ana'] })).toBe(true))
  })

  it('filters the other visuals from a period preset', async () => {
    const { user, fetchMock } = setup()
    await user.selectOptions(await screen.findByRole('combobox', { name: 'Período' }), 'Últimos 30 dias')
    await waitFor(() => expect(hasFilter(queriesOf(fetchMock, 'agent'), { field: 'sent_at', op: 'between' })).toBe(true))
    const between = queriesOf(fetchMock, 'agent').at(-1)!.filters.find((f) => f.op === 'between')!
    const days = (Date.parse(String(between.values[1])) - Date.parse(String(between.values[0]))) / 86_400_000
    expect(Math.round(days)).toBe(30)
  })

  it('uses a custom range of two dates', async () => {
    const { user, fetchMock } = setup()
    await user.selectOptions(await screen.findByRole('combobox', { name: 'Período' }), 'Personalizado')
    fireEvent.change(screen.getByLabelText('De'), { target: { value: '2026-09-01' } })
    fireEvent.change(screen.getByLabelText('Até'), { target: { value: '2026-09-10' } })
    await waitFor(() =>
      expect(hasFilter(queriesOf(fetchMock, 'agent'), { op: 'between', values: ['2026-09-01T03:00:00.000Z', '2026-09-11T02:59:59.999Z'] })).toBe(true),
    )
  })

  it('cross-filters the others when a bar is clicked, highlights it and the trail removes it', async () => {
    const { user, fetchMock } = setup()
    await user.click(await screen.findByRole('img', { name: 'Barras: Por atendente' }))
    await waitFor(() => expect(hasFilter(queriesOf(fetchMock, 'status'), { field: 'agent', op: 'in', values: ['Ana'] })).toBe(true))
    expect(queriesOf(fetchMock, 'agent').every((q) => q.filters.length === 0)).toBe(true)
    await waitFor(() => expect(screen.getByRole('img', { name: 'Barras: Por atendente' }).dataset.option).toContain('"opacity":0.35'))

    const trail = screen.getByRole('region', { name: 'Filtros ativos' })
    await user.click(within(trail).getByRole('button', { name: 'Remover filtro Atendente: Ana' }))
    expect(screen.queryByRole('region', { name: 'Filtros ativos' })).not.toBeInTheDocument()
  })

  it('clears every interaction with "Limpar tudo"', async () => {
    const { user } = setup()
    await user.click(await screen.findByRole('img', { name: 'Barras: Por atendente' }))
    await user.selectOptions(screen.getByRole('combobox', { name: 'Período' }), 'Mês atual')
    const trail = screen.getByRole('region', { name: 'Filtros ativos' })
    expect(within(trail).getAllByRole('listitem')).toHaveLength(2)
    await user.click(within(trail).getByRole('button', { name: 'Limpar tudo' }))
    expect(screen.queryByRole('region', { name: 'Filtros ativos' })).not.toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Período' })).toHaveValue('all')
  })

  it('has no editing controls and never saves', async () => {
    const { user, fetchMock } = setup()
    await user.click(await screen.findByRole('img', { name: 'Barras: Por atendente' }))
    await user.click(screen.getByRole('button', { name: 'Opções de Por atendente' }))
    expect(screen.getByRole('menuitem', { name: 'Ver dados' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Remover' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Salvar/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Adicionar/ })).not.toBeInTheDocument()
    expect(fetchMock.mock.calls.some(([, init]) => (init as RequestInit | undefined)?.method === 'PUT')).toBe(false)
  })

  it('stacks visuals in layout order for small screens', async () => {
    setup()
    const titles = (await screen.findAllByRole('region')).map((r) => r.getAttribute('aria-label')).filter((l) => l !== 'Filtros ativos')
    expect(titles).toEqual(['Atendentes', 'Período', 'Por atendente', 'Por status'])
  })
})
