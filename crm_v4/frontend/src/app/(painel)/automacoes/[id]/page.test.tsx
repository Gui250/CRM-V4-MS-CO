import { screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Flow } from '@/lib/automation-types'
import type { User } from '@/lib/types'
import { navigation } from '@/test/next-navigation'
import { mockApi, renderWithClient } from '@/test/render'
import FlowEditorPage from './page'

const me = (role: User['role']): User => ({ id: 'u1', name: 'Bia', email: 'b@x.com', role, status: 'active', createdAt: '' })
const flow: Flow = {
  id: 'f1',
  name: 'Boas-vindas',
  description: null,
  status: 'draft',
  trigger: null,
  priority: 100,
  versionNumber: null,
  updatedAt: '2026-09-22T12:00:00Z',
  lastRunAt: null,
  graph: null,
}

beforeEach(() => {
  navigation.params = { id: 'f1' }
  navigation.pathname = '/automacoes/f1'
})
afterEach(() => vi.unstubAllGlobals())

function setup(role: User['role'] = 'admin', flowResponse: { status?: number; body: unknown } = { body: flow }) {
  mockApi({ 'GET /api/auth/me': () => ({ body: me(role) }), 'GET /api/flows/f1': () => flowResponse })
  return renderWithClient(<FlowEditorPage />)
}

describe('FlowEditorPage', () => {
  it('opens the editor of the flow with its name and status', async () => {
    setup()
    expect(await screen.findByRole('heading', { name: 'Boas-vindas' })).toBeInTheDocument()
    expect(screen.getByText('Rascunho')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Adicionar Mensagem recebida' })).toBeInTheDocument()
    expect(screen.getByText('Fluxo vazio: adicione um gatilho pela paleta.')).toBeInTheDocument()
  })

  it('says when the flow does not exist and links back to the list', async () => {
    setup('admin', { status: 404, body: { code: 'NOT_FOUND', message: 'Fluxo não encontrado.' } })
    expect(await screen.findByText('Fluxo não encontrado')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Voltar às automações' })).toHaveAttribute('href', '/automacoes')
  })

  it('keeps non-admins out', async () => {
    setup('attendant')
    expect(await screen.findByText('Apenas administradores editam fluxos.')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Boas-vindas' })).not.toBeInTheDocument()
  })

  it('is read-only below 1024px', async () => {
    const matchMedia = vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
    vi.stubGlobal('matchMedia', matchMedia)
    setup()
    expect(await screen.findByText(/A edição exige uma tela maior/)).toBeInTheDocument()
    expect(matchMedia).toHaveBeenCalledWith('(min-width: 1024px)')
    expect(screen.queryByRole('button', { name: /Adicionar/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ativar' })).toBeInTheDocument()
  })
})
