import { screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { navigation, router } from '@/test/next-navigation'
import type { User } from '@/lib/types'
import { board, boardStage, lead } from '@/test/fixtures'
import { mockApi, renderWithClient } from '@/test/render'
import PipelineBoardPage from './page'

const me = (role: User['role']): User => ({ id: 'u1', name: 'Bia', email: 'b@x.com', role, status: 'active', createdAt: '' })
const data = board([boardStage({ id: 's1', name: 'Novo', leads: [lead()] })])

beforeEach(() => {
  navigation.params = { pipelineId: 'p1' }
  navigation.pathname = '/funis/p1'
  navigation.searchParams = new URLSearchParams()
})
afterEach(() => {
  vi.unstubAllGlobals()
  router.replace.mockReset()
})

function setup(role: User['role']) {
  const boardUrls: string[] = []
  mockApi({
    'GET /api/auth/me': () => ({ body: me(role) }),
    'GET /api/pipelines': () => ({ body: [data.pipeline] }),
    'GET /api/users/assignable': () => ({ body: [] }),
    'GET /api/leads/l1': () => ({ body: { ...lead(), notes: null, history: [] } }),
    'GET /api/pipelines/p1/board': (_init, url) => {
      boardUrls.push(url.search)
      return { body: data }
    },
  })
  return { boardUrls, ...renderWithClient(<PipelineBoardPage />) }
}

describe('pipeline board page', () => {
  it('shows "Editar etapas" only to admins', async () => {
    setup('attendant')
    expect(await screen.findByRole('list', { name: 'Leads em Novo' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Editar etapas' })).not.toBeInTheDocument()
  })

  it('links admins to the stage editor', async () => {
    setup('admin')
    expect(await screen.findByRole('link', { name: 'Editar etapas' })).toHaveAttribute('href', '/funis/p1/etapas')
  })

  it('reads filters from the URL, resolving "me" to the user id for the board query', async () => {
    navigation.searchParams = new URLSearchParams('assignee=me&q=carla')
    const { boardUrls } = setup('attendant')
    await waitFor(() => expect(boardUrls).toContain('?assignee=u1&search=carla'))
    expect(screen.getByLabelText('Responsável')).toHaveValue('me')
  })

  it('writes filter changes and the opened lead to the URL, and shows the lead panel', async () => {
    const { user } = setup('attendant')
    await user.selectOptions(await screen.findByLabelText('Responsável'), 'none')
    expect(router.replace).toHaveBeenLastCalledWith('/funis/p1?assignee=none', { scroll: false })

    await user.click(screen.getByRole('button', { name: /Abrir lead/ }))
    expect(router.replace).toHaveBeenLastCalledWith('/funis/p1?lead=l1', { scroll: false })

    navigation.searchParams = new URLSearchParams('lead=l1')
    setup('attendant')
    expect(await screen.findByRole('dialog', { name: 'Carla Mendes' })).toBeInTheDocument()
  })
})
