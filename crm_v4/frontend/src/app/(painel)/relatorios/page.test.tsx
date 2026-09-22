import { screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { router } from '@/test/next-navigation'
import type { ReportSummary } from '@/lib/bi/types'
import type { User } from '@/lib/types'
import { bodiesOf, makeReport } from '@/components/bi/test-utils'
import { mockApi, renderWithClient } from '@/test/render'
import ReportsPage from './page'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

const me: User = { id: 'u1', name: 'Ana', email: 'a@x.com', role: 'attendant', status: 'active', createdAt: '2026-09-22T12:00:00.000Z' }
const summaries: ReportSummary[] = [
  { id: 'r1', name: 'Atendimento', ownerName: 'Ana', permission: 'owner', updatedAt: '2026-09-22T15:00:00.000Z' },
  { id: 'r2', name: 'Vendas', ownerName: 'Bia', permission: 'view', updatedAt: '2026-09-21T12:30:00.000Z' },
]

function setup(routes: Parameters<typeof mockApi>[0] = {}) {
  const fetchMock = mockApi({
    'GET /api/auth/me': () => ({ body: me }),
    'GET /api/bi/reports': () => ({ body: summaries }),
    'POST /api/bi/reports': (init) => ({ status: 201, body: makeReport({ id: 'r9', name: JSON.parse(String(init?.body)).name }) }),
    ...routes,
  })
  return { fetchMock, ...renderWithClient(<ReportsPage />) }
}

describe('Relatórios page', () => {
  it('splits own reports from shared ones with owner, permission and update date', async () => {
    setup()
    const mine = await screen.findByRole('list', { name: 'Meus relatórios' })
    expect(within(mine).getByRole('link', { name: 'Atendimento' })).toHaveAttribute('href', '/relatorios/r1')
    expect(within(mine).getByText('Dono')).toBeInTheDocument()
    const shared = screen.getByRole('list', { name: 'Compartilhados comigo' })
    expect(within(shared).getByText('Bia · atualizado em 21/09/2026 09:30')).toBeInTheDocument()
    expect(within(shared).getByText('Só visualizar')).toBeInTheDocument()
  })

  it('creates a report from the WhatsApp template and opens it', async () => {
    const { user, fetchMock } = setup()
    await user.click(screen.getByRole('button', { name: 'Novo relatório' }))
    const dialog = screen.getByRole('dialog', { name: 'Novo relatório' })
    await user.type(within(dialog).getByLabelText('Nome do relatório'), 'Suporte')
    await user.click(within(dialog).getByRole('radio', { name: /Modelo: Atendimento WhatsApp/ }))
    await user.click(within(dialog).getByRole('button', { name: 'Criar' }))
    await vi.waitFor(() => expect(router.push).toHaveBeenCalledWith('/relatorios/r9'))
    expect(bodiesOf(fetchMock, 'POST /api/bi/reports')).toEqual([{ name: 'Suporte', templateId: 'whatsapp_attendance' }])
  })

  it('creates a blank report without template', async () => {
    const { user, fetchMock } = setup()
    await user.click(screen.getByRole('button', { name: 'Novo relatório' }))
    await user.type(screen.getByLabelText('Nome do relatório'), 'Vazio{Enter}')
    await vi.waitFor(() => expect(bodiesOf(fetchMock, 'POST /api/bi/reports')).toEqual([{ name: 'Vazio' }]))
  })

  it('duplicates with a suggested name', async () => {
    const { user, fetchMock } = setup()
    await user.click(await screen.findByRole('button', { name: 'Ações de Vendas' }))
    await user.click(screen.getByRole('menuitem', { name: 'Duplicar' }))
    expect(screen.getByLabelText('Nome do relatório')).toHaveValue('Vendas (cópia)')
    await user.click(screen.getByRole('button', { name: 'Duplicar' }))
    await vi.waitFor(() => expect(bodiesOf(fetchMock, 'POST /api/bi/reports')).toEqual([{ name: 'Vendas (cópia)', duplicateOf: 'r2' }]))
  })

  it('deletes own reports after confirmation only', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const { user, fetchMock } = setup({ 'DELETE /api/bi/reports/r1': () => ({ status: 204 }) })
    await user.click(await screen.findByRole('button', { name: 'Ações de Vendas' }))
    expect(screen.queryByRole('menuitem', { name: 'Excluir' })).not.toBeInTheDocument()
    await user.keyboard('{Escape}')
    await user.click(screen.getByRole('button', { name: 'Ações de Atendimento' }))
    await user.click(screen.getByRole('menuitem', { name: 'Excluir' }))
    expect(confirm).toHaveBeenCalled()
    await vi.waitFor(() => expect(fetchMock.mock.calls.some(([, init]) => (init as RequestInit | undefined)?.method === 'DELETE')).toBe(true))
  })
})
