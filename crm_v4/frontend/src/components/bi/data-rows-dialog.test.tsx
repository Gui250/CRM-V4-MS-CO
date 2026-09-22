import { screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { QueryRequest } from '@/lib/bi/types'
import { mockApi, renderWithClient } from '@/test/render'
import { DataRowsDialog } from './data-rows-dialog'
import { SOURCE_ID, bodiesOf } from './test-utils'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const filters = [{ sourceId: SOURCE_ID, field: 'agent', op: 'in' as const, values: ['Ana'] }]
const request: QueryRequest = { sourceId: SOURCE_ID, dimensions: [], measures: [], filters, calculatedFields: [], limit: 20, groupOthers: true }
const columns = [{ key: 'agent', label: 'Atendente', type: 'text' }, { key: 'value', label: 'Valor', type: 'currency' }]

function setup() {
  const fetchMock = mockApi({
    'POST /api/bi/rows': (init) => {
      const { page } = JSON.parse(String(init?.body)) as { page: number }
      return { body: { columns, rows: [[`Linha da página ${page}`, 1234.5]], total: 250 } }
    },
    'POST /api/bi/rows.csv': () => ({ body: 'Atendente;Valor' }),
  })
  const onClose = vi.fn()
  const utils = renderWithClient(<DataRowsDialog title="Por atendente" request={request} onClose={onClose} />)
  return { fetchMock, onClose, ...utils }
}

describe('DataRowsDialog', () => {
  it('lists the rows with pt-BR formatting', async () => {
    setup()
    expect(screen.getByRole('dialog', { name: 'Dados: Por atendente' })).toBeInTheDocument()
    expect(await screen.findByText('Linha da página 1')).toBeInTheDocument()
    expect(screen.getByText(/R\$\s1\.234,50/)).toBeInTheDocument()
  })

  it('paginates 100 rows at a time with the visual filters', async () => {
    const { user, fetchMock } = setup()
    expect(await screen.findByText('Página 1 de 3 · 250 linhas')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Próxima' }))
    expect(await screen.findByText('Linha da página 2')).toBeInTheDocument()
    expect(bodiesOf(fetchMock, 'POST /api/bi/rows').at(-1)).toEqual({ sourceId: SOURCE_ID, filters, calculatedFields: [], page: 2 })
  })

  it('downloads the spreadsheet posting the same filters without page', async () => {
    const createObjectURL = vi.fn(() => 'blob:csv')
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() }))
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    const { user, fetchMock } = setup()
    await user.click(screen.getByRole('button', { name: 'Baixar planilha' }))
    await vi.waitFor(() => expect(click).toHaveBeenCalled())
    expect(bodiesOf(fetchMock, 'POST /api/bi/rows.csv')).toEqual([{ sourceId: SOURCE_ID, filters, calculatedFields: [] }])
    expect((click.mock.contexts[0] as HTMLAnchorElement).download).toBe('Por atendente.csv')
  })

  it('closes with Escape', async () => {
    const { user, onClose } = setup()
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalled()
  })
})
