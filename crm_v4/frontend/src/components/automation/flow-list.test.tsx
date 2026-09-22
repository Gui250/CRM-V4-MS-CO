import { screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FlowSummary } from '@/lib/automation-types'
import { router } from '@/test/next-navigation'
import { mockApi, renderWithClient } from '@/test/render'
import { FlowList } from './flow-list'

const flow = (overrides: Partial<FlowSummary>): FlowSummary => ({
  id: 'f1',
  name: 'Boas-vindas',
  description: null,
  status: 'draft',
  trigger: 'message_received',
  priority: 100,
  versionNumber: 1,
  updatedAt: '2026-09-22T12:00:00Z',
  lastRunAt: null,
  ...overrides,
})

const bodyOf = (fetchMock: ReturnType<typeof mockApi>, method: string) =>
  JSON.parse(String(fetchMock.mock.calls.find(([, init]) => init?.method === method)![1]!.body))

beforeEach(() => router.push.mockClear())
afterEach(() => vi.unstubAllGlobals())

describe('FlowList', () => {
  it('lists flows with status, trigger, last run and links', async () => {
    mockApi({
      'GET /api/flows': () => ({
        body: [flow({}), flow({ id: 'f2', name: 'Follow-up', status: 'active', trigger: 'manual', lastRunAt: '2026-09-20T09:05:00' })],
      }),
    })
    renderWithClient(<FlowList />)

    const row = (await screen.findByRole('link', { name: 'Follow-up' })).closest('li')!
    expect(within(row).getByText('Ativo')).toBeInTheDocument()
    expect(within(row).getByText(/Disparo manual · Última execução: 20\/09\/2026 09:05/)).toBeInTheDocument()
    expect(within(row).getByRole('link', { name: 'Execuções' })).toHaveAttribute('href', '/automacoes/f2/execucoes')
    expect(screen.getByText(/Mensagem recebida · Última execução: Nunca/)).toBeInTheDocument()
    expect(screen.getByText('Rascunho')).toBeInTheDocument()
  })

  it('creates a flow and opens the editor', async () => {
    const fetchMock = mockApi({
      'GET /api/flows': () => ({ body: [] }),
      'POST /api/flows': () => ({ status: 201, body: { ...flow({ id: 'new' }), graph: null } }),
    })
    const { user } = renderWithClient(<FlowList />)

    await user.type(screen.getByLabelText('Nome do novo fluxo'), 'Reativação')
    await user.click(screen.getByRole('button', { name: 'Novo fluxo' }))

    await vi.waitFor(() => expect(router.push).toHaveBeenCalledWith('/automacoes/new'))
    expect(bodyOf(fetchMock, 'POST')).toEqual({ name: 'Reativação' })
  })

  it('shows the INVALID_FLOW message when activation fails', async () => {
    mockApi({
      'GET /api/flows': () => ({ body: [flow({})] }),
      'POST /api/flows/f1/activate': () => ({
        status: 422,
        body: { code: 'INVALID_FLOW', message: 'O fluxo tem problemas. Corrija os blocos destacados.', issues: [] },
      }),
    })
    const { user } = renderWithClient(<FlowList />)

    await user.click(await screen.findByRole('button', { name: 'Ativar' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('O fluxo tem problemas. Corrija os blocos destacados.')
  })

  it('saves the priority on blur and rejects values out of range', async () => {
    const fetchMock = mockApi({
      'GET /api/flows': () => ({ body: [flow({})] }),
      'PATCH /api/flows/f1': () => ({ body: { ...flow({ priority: 5 }), graph: null } }),
    })
    const { user } = renderWithClient(<FlowList />)
    const input = await screen.findByLabelText('Prioridade')

    await user.clear(input)
    await user.type(input, '5000')
    await user.tab()
    expect(screen.getByRole('alert')).toHaveTextContent('A prioridade precisa ser um número entre 1 e 1000.')

    await user.clear(input)
    await user.type(input, '5')
    await user.tab()
    await vi.waitFor(() => expect(bodyOf(fetchMock, 'PATCH')).toEqual({ priority: 5 }))
  })

  it('disables delete while active and asks for confirmation otherwise', async () => {
    const fetchMock = mockApi({
      'GET /api/flows': () => ({ body: [flow({ id: 'a', name: 'Ativo', status: 'active' }), flow({ id: 'd', name: 'Rascunho' })] }),
      'DELETE /api/flows/d': () => ({ status: 204 }),
    })
    const { user } = renderWithClient(<FlowList />)

    const [activeDelete, draftDelete] = await screen.findAllByRole('button', { name: 'Excluir' })
    expect(activeDelete).toBeDisabled()

    await user.click(draftDelete!)
    expect(screen.getByText('Confirmar exclusão?')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Sim, excluir' }))

    await vi.waitFor(() => expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(true))
  })
})
