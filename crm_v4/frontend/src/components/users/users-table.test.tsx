import { screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { User } from '@/lib/types'
import { mockApi, renderWithClient } from '@/test/render'
import { UsersTable } from './users-table'

const user = (overrides: Partial<User>): User => ({
  id: 'u',
  name: 'Pessoa',
  email: 'p@x.com',
  role: 'attendant',
  status: 'active',
  createdAt: '2026-01-01T00:00:00Z',
  ...overrides,
})

afterEach(() => vi.unstubAllGlobals())

describe('UsersTable', () => {
  it('approves a pending user', async () => {
    const fetchMock = mockApi({
      'GET /api/users': () => ({ body: [user({ id: 'p1', name: 'Bia', status: 'pending' })] }),
      'PATCH /api/users/p1': () => ({ body: user({ id: 'p1', status: 'active' }) }),
    })
    const { user: ui } = renderWithClient(<UsersTable currentUserId="admin" />)

    await ui.click(await screen.findByRole('button', { name: 'Aprovar' }))

    const patch = fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH')!
    expect(JSON.parse(String(patch[1]!.body))).toEqual({ status: 'active' })
  })

  it('offers disable and role change for active users, but not disabling yourself', async () => {
    mockApi({
      'GET /api/users': () => ({
        body: [user({ id: 'admin', name: 'Eu', role: 'admin' }), user({ id: 'a2', name: 'Outro' })],
      }),
    })
    const { user: ui } = renderWithClient(<UsersTable currentUserId="admin" />)
    await ui.click(screen.getByRole('tab', { name: 'Ativos' }))

    expect(await screen.findByText('Outro')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Desativar' })).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Tornar atendente' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tornar administrador' })).toBeInTheDocument()
  })

  it('shows the LAST_ADMIN message from the API', async () => {
    mockApi({
      'GET /api/users': () => ({ body: [user({ id: 'a1', role: 'admin' })] }),
      'PATCH /api/users/a1': () => ({ status: 409, body: { code: 'LAST_ADMIN', message: 'É preciso manter pelo menos um administrador ativo.' } }),
    })
    const { user: ui } = renderWithClient(<UsersTable currentUserId="other" />)
    await ui.click(screen.getByRole('tab', { name: 'Ativos' }))

    await ui.click(await screen.findByRole('button', { name: 'Tornar atendente' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('É preciso manter pelo menos um administrador ativo.')
  })

  it('shows an empty state per tab', async () => {
    mockApi({ 'GET /api/users': () => ({ body: [] }) })
    renderWithClient(<UsersTable currentUserId="admin" />)
    expect(await screen.findByText('Nenhum cadastro aguardando aprovação.')).toBeInTheDocument()
  })
})
