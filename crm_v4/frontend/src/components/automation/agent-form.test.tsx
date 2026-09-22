import { screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AiAgent, AiProvider } from '@/lib/automation-types'
import { mockApi, renderWithClient } from '@/test/render'
import { AgentForm, validateAgent } from './agent-form'
import { AgentManager } from './agent-list'

const providers: AiProvider[] = [
  { id: 'p1', name: 'OpenAI', vendor: 'openai', keyHint: '…1', availableModels: ['gpt-5'], lastTestedAt: '2026-09-22T10:00:00Z', agentCount: 0 },
  { id: 'p2', name: 'Claude', vendor: 'anthropic', keyHint: '…2', availableModels: ['claude-opus-5', 'claude-sonnet-5'], lastTestedAt: '2026-09-22T10:00:00Z', agentCount: 0 },
]

const agent: AiAgent = {
  id: 'a1',
  name: 'Qualificação',
  provider: { id: 'p1', name: 'OpenAI', vendor: 'openai' },
  model: 'gpt-5',
  instructions: 'Pergunte o faturamento.',
  historySize: 20,
  isActive: true,
  updatedAt: '2026-09-22T10:00:00Z',
}

const bodyOf = (fetchMock: ReturnType<typeof mockApi>, method: string) =>
  JSON.parse(String(fetchMock.mock.calls.find(([, init]) => init?.method === method)![1]!.body))

afterEach(() => vi.unstubAllGlobals())

describe('validateAgent', () => {
  const valid = { name: 'Bot', providerId: 'p1', model: 'gpt-5', instructions: 'x', historySize: 20 }
  it('accepts a valid agent and rejects out-of-range fields', () => {
    expect(validateAgent(valid)).toBeNull()
    expect(validateAgent({ ...valid, name: 'B' })).toMatch('entre 2 e 60')
    expect(validateAgent({ ...valid, instructions: 'a'.repeat(8001) })).toMatch('entre 1 e 8000')
    expect(validateAgent({ ...valid, historySize: 51 })).toMatch('entre 5 e 50')
    expect(validateAgent({ ...valid, model: '' })).toBe('Escolha um modelo.')
  })
})

describe('AgentForm', () => {
  it('points to the providers page when there are none', async () => {
    mockApi({ 'GET /api/ai-providers': () => ({ body: [] }) })
    renderWithClient(<AgentForm />)
    expect(await screen.findByRole('link', { name: 'Ir para Provedores de IA' })).toHaveAttribute('href', '/automacoes/provedores')
  })

  it('offers only the chosen provider models, counts instructions and creates the agent', async () => {
    const fetchMock = mockApi({
      'GET /api/ai-providers': () => ({ body: providers }),
      'POST /api/ai-agents': () => ({ status: 201, body: agent }),
    })
    const { user } = renderWithClient(<AgentForm />)

    await user.type(await screen.findByLabelText('Nome'), 'Qualificação')
    await user.selectOptions(screen.getByLabelText('Provedor'), 'p2')
    const model = screen.getByLabelText('Modelo')
    expect(within(model).getAllByRole('option').map((o) => o.textContent)).toEqual(['Escolha…', 'claude-opus-5', 'claude-sonnet-5'])
    await user.selectOptions(model, 'claude-sonnet-5')
    await user.selectOptions(screen.getByLabelText('Provedor'), 'p1')
    expect(screen.getByLabelText('Modelo')).toHaveValue('')
    await user.selectOptions(screen.getByLabelText('Modelo'), 'gpt-5')
    await user.type(screen.getByLabelText(/Instruções/), 'Seja breve.')
    expect(screen.getByText('11 / 8000')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Criar agente' }))

    await vi.waitFor(() =>
      expect(bodyOf(fetchMock, 'POST')).toEqual({ name: 'Qualificação', providerId: 'p1', model: 'gpt-5', instructions: 'Seja breve.', historySize: 20 }),
    )
  })

  it('blocks submit with a validation message', async () => {
    mockApi({ 'GET /api/ai-providers': () => ({ body: providers }) })
    const { user } = renderWithClient(<AgentForm />)
    await user.click(await screen.findByRole('button', { name: 'Criar agente' }))
    expect(screen.getByRole('alert')).toHaveTextContent('O nome precisa ter entre 2 e 60 caracteres.')
  })
})

describe('AgentManager', () => {
  it('toggles an agent, edits it and shows AGENT_IN_USE on delete', async () => {
    const fetchMock = mockApi({
      'GET /api/ai-providers': () => ({ body: providers }),
      'GET /api/ai-agents': () => ({ body: [agent] }),
      'PATCH /api/ai-agents/a1': () => ({ body: { ...agent, isActive: false } }),
      'DELETE /api/ai-agents/a1': () => ({ status: 409, body: { code: 'AGENT_IN_USE', message: 'Usado pelos fluxos ativos: Boas-vindas.' } }),
    })
    const { user } = renderWithClient(<AgentManager />)

    await user.click(await screen.findByRole('button', { name: 'Desativar' }))
    await vi.waitFor(() => expect(bodyOf(fetchMock, 'PATCH')).toEqual({ isActive: false }))

    await user.click(screen.getByRole('button', { name: 'Excluir' }))
    expect(await screen.findByText('Usado pelos fluxos ativos: Boas-vindas.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Editar' }))
    const form = screen.getByRole('form', { name: 'Editar Qualificação' })
    expect(within(form).getByLabelText('Modelo')).toHaveValue('gpt-5')
  })
})
