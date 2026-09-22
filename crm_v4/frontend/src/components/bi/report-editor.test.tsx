import { screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '@/test/next-navigation'
import { makePage, makeVisual } from '@/lib/bi/test-helpers'
import type { Report, ReportDefinition } from '@/lib/bi/types'
import { renderWithClient } from '@/test/render'
import { ReportEditor } from './report-editor'
import { SOURCE_ID, bodiesOf, makeReport, mockBiApi } from './test-utils'

vi.mock('./visuals/echart', async () => ({ EChart: (await import('./test-utils')).FakeEChart }))

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

type Routes = Parameters<typeof mockBiApi>[0]

function setup(routes: Routes = {}, report: Report = makeReport()) {
  const fetchMock = mockBiApi({ 'GET /api/bi/reports/r1': () => ({ body: report }), ...routes })
  const utils = renderWithClient(
    <>
      <a href="/chat">Chat</a>
      <ReportEditor report={report} canShare />
    </>,
  )
  return { fetchMock, ...utils }
}

const savedDefinition = (fetchMock: ReturnType<typeof mockBiApi>) =>
  (bodiesOf(fetchMock, 'PUT /api/bi/reports/r1').at(-1) as { definition: ReportDefinition }).definition

async function addViaPalette(user: ReturnType<typeof setup>['user'], label: string) {
  screen.getByRole('button', { name: `Adicionar ${label}` }).focus()
  await user.keyboard('{Enter}')
}

describe('ReportEditor', () => {
  it('shows palette, empty canvas and the fields of the chosen source', async () => {
    setup()
    expect(screen.getByRole('button', { name: 'Adicionar Colunas' })).toBeInTheDocument()
    expect(screen.getByText('Tela em branco')).toBeInTheDocument()
    expect(await screen.findByText('Campos · Mensagens')).toBeInTheDocument()
    expect(screen.getByText('Atendente')).toBeInTheDocument()
  })

  it('adds a visual from the palette with the keyboard', async () => {
    const { user } = setup()
    await addViaPalette(user, 'Colunas')
    expect(screen.getByRole('group', { name: 'Componente Colunas' })).toBeInTheDocument()
    expect(screen.getByText('Arraste campos para montar o componente')).toBeInTheDocument()
  })

  it('fills slots through "Adicionar a…" and draws the chart from the query', async () => {
    const { user, fetchMock } = setup()
    await addViaPalette(user, 'Colunas')
    await user.click(await screen.findByRole('button', { name: 'Adicionar Atendente a…' }))
    await user.click(screen.getByRole('menuitem', { name: 'Categoria' }))
    await user.click(screen.getByRole('button', { name: 'Adicionar Valor a…' }))
    await user.click(screen.getByRole('menuitem', { name: 'Valor' }))

    expect(await screen.findByRole('img', { name: 'Colunas: Soma de Valor por Atendente' })).toBeInTheDocument()
    expect(bodiesOf(fetchMock, 'POST /api/bi/query')).toContainEqual(
      expect.objectContaining({ dimensions: [{ sourceId: SOURCE_ID, field: 'agent' }], measures: [{ sourceId: SOURCE_ID, field: 'value', aggregation: 'sum' }] }),
    )
  })

  it('saves with PUT carrying the loaded version', async () => {
    const { user, fetchMock } = setup({ 'PUT /api/bi/reports/r1': (init) => ({ body: { ...makeReport(), ...JSON.parse(String(init?.body)), version: 4 } }) })
    await addViaPalette(user, 'Indicador')
    await user.click(screen.getByRole('button', { name: 'Salvar' }))
    await screen.findByRole('button', { name: 'Salvo' })
    const body = bodiesOf(fetchMock, 'PUT /api/bi/reports/r1')[0] as { version: number; name: string; definition: ReportDefinition }
    expect(body.version).toBe(3)
    expect(body.name).toBe('Atendimento')
    expect(body.definition.pages[0]!.visuals).toHaveLength(1)
  })

  it('undoes with Ctrl+Z and redoes with Ctrl+Shift+Z', async () => {
    const { user } = setup()
    await addViaPalette(user, 'Colunas')
    await user.keyboard('{Control>}z{/Control}')
    expect(screen.queryByRole('group', { name: 'Componente Colunas' })).not.toBeInTheDocument()
    await user.keyboard('{Control>}{Shift>}z{/Shift}{/Control}')
    expect(screen.getByRole('group', { name: 'Componente Colunas' })).toBeInTheDocument()
  })

  it('moves the selected visual with arrows and resizes it with Shift+arrows', async () => {
    const { user, fetchMock } = setup({ 'PUT /api/bi/reports/r1': () => ({ body: makeReport({ version: 4 }) }) })
    await addViaPalette(user, 'Indicador')
    screen.getByRole('group', { name: 'Componente Indicador' }).focus()
    await user.keyboard('{ArrowRight}{Shift>}{ArrowDown}{/Shift}')
    await user.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(savedDefinition(fetchMock).pages[0]!.visuals[0]!.layout).toEqual({ x: 1, y: 0, w: 3, h: 3 }))
  })

  it('asks before leaving with unsaved changes', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const { user } = setup()
    const unload = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(unload)
    expect(unload.defaultPrevented).toBe(false)

    await addViaPalette(user, 'Texto')
    window.dispatchEvent(unload)
    expect(unload.defaultPrevented).toBe(true)
    const click = new MouseEvent('click', { bubbles: true, cancelable: true })
    screen.getByRole('link', { name: 'Chat' }).dispatchEvent(click)
    expect(confirm).toHaveBeenCalledWith('Há alterações não salvas. Sair mesmo assim?')
    expect(click.defaultPrevented).toBe(true)
  })

  it('replaces the page with the suggested report, undoably', async () => {
    const suggested = makePage({
      id: 'server-page',
      name: 'Sugestão',
      visuals: [makeVisual({ id: 'k', type: 'text', title: 'Resumo', options: { limit: 20, crossFilter: true, text: 'Olá' } })],
    })
    const { user, fetchMock } = setup({ 'POST /api/bi/suggest': () => ({ body: suggested }) })
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Gerar relatório sugerido' })[0]).toBeEnabled())
    await user.click(screen.getAllByRole('button', { name: 'Gerar relatório sugerido' })[0]!)
    expect(await screen.findByRole('group', { name: 'Componente Resumo' })).toBeInTheDocument()
    expect(bodiesOf(fetchMock, 'POST /api/bi/suggest')).toEqual([{ sourceId: SOURCE_ID }])
    await user.click(screen.getByRole('button', { name: 'Desfazer' }))
    expect(screen.queryByRole('group', { name: 'Componente Resumo' })).not.toBeInTheDocument()
  })

  it('shows who saved first on conflict and can overwrite', async () => {
    let reads = 0
    const theirs = makeReport({ version: 4, ownerName: 'Bia', updatedAt: '2026-09-22T17:30:00.000Z' })
    const { user, fetchMock } = setup({
      'GET /api/bi/reports/r1': () => ({ body: reads++ === 0 ? makeReport() : theirs }),
      'PUT /api/bi/reports/r1': (init) =>
        JSON.parse(String(init?.body)).force
          ? { body: makeReport({ version: 5 }) }
          : { status: 409, body: { code: 'REPORT_CONFLICT', message: 'Outra pessoa salvou.' } },
    })
    await addViaPalette(user, 'Texto')
    await user.click(screen.getByRole('button', { name: 'Salvar' }))
    const banner = await screen.findByText(/Bia salvou às 14:30/)
    await user.click(within(banner.closest('[role="alert"]') as HTMLElement).getByRole('button', { name: 'Sobrescrever' }))
    await waitFor(() => expect(bodiesOf(fetchMock, 'PUT /api/bi/reports/r1').at(-1)).toMatchObject({ force: true, version: 4 }))
    await waitFor(() => expect(screen.queryByText(/Bia salvou/)).not.toBeInTheDocument())
  })

  it('switches to the read-only preview and back', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: 'Visualizar' }))
    expect(screen.queryByRole('button', { name: 'Salvar' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Voltar a editar' }))
    expect(screen.getByRole('button', { name: 'Salvo' })).toBeInTheDocument()
  })
})
