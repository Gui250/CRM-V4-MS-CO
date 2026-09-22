import { screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '@/test/next-navigation'
import type { Pipeline, User } from '@/lib/types'
import { stage } from '@/test/fixtures'
import { mockApi, renderWithClient } from '@/test/render'
import PipelinesPage from './page'

afterEach(() => vi.unstubAllGlobals())

const user = (role: User['role']): User => ({ id: 'u1', name: 'Ana', email: 'a@x.com', role, status: 'active', createdAt: '2026-09-22T12:00:00.000Z' })
const pipeline = (overrides: Partial<Pipeline> = {}): Pipeline => ({
  id: 'p1',
  name: 'Vendas',
  isEntry: true,
  archivedAt: null,
  stages: [stage({ id: 's1', name: 'Novo' }), stage({ id: 's2', name: 'Ganho', kind: 'won', color: 'green', position: 1 })],
  ...overrides,
})

function setup(role: User['role'], routes: Parameters<typeof mockApi>[0] = {}) {
  const calls: { key: string; body: unknown }[] = []
  mockApi({
    'GET /api/auth/me': () => ({ body: user(role) }),
    'GET /api/pipelines': (_init, url) => ({
      body: url.search.includes('includeArchived') ? [pipeline(), pipeline({ id: 'p9', name: 'Antigo', isEntry: false, archivedAt: '2026-09-01T00:00:00.000Z' })] : [pipeline()],
    }),
    ...Object.fromEntries(
      Object.entries(routes).map(([key, handler]) => [
        key,
        (init: RequestInit | undefined, url: URL) => {
          calls.push({ key, body: init?.body ? JSON.parse(String(init.body)) : undefined })
          return handler(init, url)
        },
      ]),
    ),
  })
  return { calls, ...renderWithClient(<PipelinesPage />) }
}

describe('Funis page', () => {
  it('lists pipelines with their stages for everyone, without admin controls for attendants', async () => {
    setup('attendant')
    const card = await screen.findByRole('link', { name: /Vendas/ })
    expect(card).toHaveAttribute('href', '/funis/p1')
    expect(within(card).getByText('Entrada')).toBeInTheDocument()
    expect(within(card).getByText('Novo → Ganho')).toBeInTheDocument()
    expect(screen.queryByLabelText('Novo funil')).not.toBeInTheDocument()
    expect(screen.queryByText('Arquivar')).not.toBeInTheDocument()
    expect(screen.queryByText('Editar etapas')).not.toBeInTheDocument()
  })

  it('lets an admin create a pipeline and see a name conflict', async () => {
    const { user: actor, calls } = setup('admin', {
      'POST /api/pipelines': () => ({ status: 409, body: { code: 'PIPELINE_NAME_TAKEN', message: 'Já existe um funil com esse nome.' } }),
    })
    await actor.type(await screen.findByLabelText('Novo funil'), 'vendas')
    await actor.click(screen.getByRole('button', { name: 'Criar funil' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Já existe um funil com esse nome.')
    expect(calls[0]).toEqual({ key: 'POST /api/pipelines', body: { name: 'vendas' } })
  })

  it('lets an admin rename, toggle the entry pipeline, archive and reactivate', async () => {
    const { user: actor, calls } = setup('admin', {
      'PATCH /api/pipelines/p1': () => ({ body: pipeline() }),
      'PATCH /api/pipelines/p9': () => ({ body: pipeline({ id: 'p9' }) }),
    })
    await actor.click(await screen.findByRole('button', { name: 'Renomear' }))
    const field = screen.getByLabelText('Novo nome de Vendas')
    await actor.clear(field)
    await actor.type(field, 'Vendas B2B')
    await actor.click(screen.getByRole('button', { name: 'Salvar' }))
    await actor.click(screen.getByLabelText('Funil de entrada'))
    await actor.click(screen.getByRole('button', { name: 'Arquivar' }))
    await waitFor(() => expect(calls.map((c) => c.body)).toEqual([{ name: 'Vendas B2B' }, { isEntry: false }, { archived: true }]))
    expect(screen.getByRole('link', { name: 'Editar etapas' })).toHaveAttribute('href', '/funis/p1/etapas')

    await actor.click(screen.getByLabelText('Mostrar arquivados'))
    await actor.click(await screen.findByRole('button', { name: 'Reativar' }))
    await waitFor(() => expect(calls.at(-1)).toEqual({ key: 'PATCH /api/pipelines/p9', body: { archived: false } }))
  })
})
