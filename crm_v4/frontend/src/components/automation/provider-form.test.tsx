import { screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AiProvider } from '@/lib/automation-types'
import { mockApi, renderWithClient } from '@/test/render'
import { ProviderManager } from './provider-form'

const provider = (overrides: Partial<AiProvider> = {}): AiProvider => ({
  id: 'p1',
  name: 'OpenAI produção',
  vendor: 'openai',
  keyHint: '…a9F2',
  availableModels: ['gpt-5', 'gpt-4.1'],
  lastTestedAt: '2026-09-22T10:30:00',
  agentCount: 1,
  ...overrides,
})

const bodyOf = (fetchMock: ReturnType<typeof mockApi>, method: string) =>
  JSON.parse(String(fetchMock.mock.calls.find(([, init]) => init?.method === method)![1]!.body))

afterEach(() => vi.unstubAllGlobals())

describe('ProviderManager', () => {
  it('lists providers with the key hint only', async () => {
    mockApi({ 'GET /api/ai-providers': () => ({ body: [provider()] }) })
    renderWithClient(<ProviderManager />)
    expect(await screen.findByText(/Chave …a9F2 · 2 modelos · testado em 22\/09\/2026 10:30 · 1 agente\(s\)/)).toBeInTheDocument()
    expect(screen.getByText('· OpenAI')).toBeInTheDocument()
  })

  it('creates a provider, shows the test in progress and clears the key', async () => {
    const fetchMock = mockApi({ 'GET /api/ai-providers': () => ({ body: [] }), 'POST /api/ai-providers': () => ({ status: 201, body: provider() }) })
    const answer = fetchMock.getMockImplementation()!
    let release = () => {}
    fetchMock.mockImplementation(async (input, init) => {
      if (init?.method === 'POST') await new Promise<void>((r) => (release = r))
      return answer(input, init)
    })
    const { user } = renderWithClient(<ProviderManager />)
    const form = await screen.findByRole('form', { name: 'Novo provedor' })

    await user.selectOptions(within(form).getByLabelText('Fornecedor'), 'anthropic')
    await user.type(within(form).getByLabelText('Nome'), 'Claude')
    await user.type(within(form).getByLabelText('Chave da API'), 'sk-ant-1234567890')
    await user.click(within(form).getByRole('button', { name: 'Testar e salvar' }))

    expect(await within(form).findByRole('button', { name: 'Testando conexão…' })).toBeDisabled()
    expect(bodyOf(fetchMock, 'POST')).toEqual({ vendor: 'anthropic', name: 'Claude', apiKey: 'sk-ant-1234567890' })
    release()
    await vi.waitFor(() => expect(within(form).getByLabelText('Chave da API')).toHaveValue(''))
  })

  it('shows the connection failure message and keeps the form', async () => {
    mockApi({
      'GET /api/ai-providers': () => ({ body: [] }),
      'POST /api/ai-providers': () => ({
        status: 422,
        body: { code: 'AI_PROVIDER_TEST_FAILED', message: 'Não foi possível conectar: chave inválida ou sem permissão.' },
      }),
    })
    const { user } = renderWithClient(<ProviderManager />)
    const form = await screen.findByRole('form', { name: 'Novo provedor' })
    await user.type(within(form).getByLabelText('Nome'), 'OpenAI')
    await user.type(within(form).getByLabelText('Chave da API'), 'sk-wrong-12345')
    await user.click(within(form).getByRole('button', { name: 'Testar e salvar' }))

    expect(await within(form).findByRole('alert')).toHaveTextContent('Não foi possível conectar: chave inválida ou sem permissão.')
    expect(within(form).getByLabelText('Chave da API')).toHaveValue('sk-wrong-12345')
  })

  it('shows PROVIDER_IN_USE when deleting a provider with agents', async () => {
    mockApi({
      'GET /api/ai-providers': () => ({ body: [provider()] }),
      'DELETE /api/ai-providers/p1': () => ({
        status: 409,
        body: { code: 'PROVIDER_IN_USE', message: 'Este provedor é usado pelos agentes: Qualificação.' },
      }),
    })
    const { user } = renderWithClient(<ProviderManager />)
    await user.click(await screen.findByRole('button', { name: 'Excluir' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Este provedor é usado pelos agentes: Qualificação.')
  })

  it('replaces the key and retests', async () => {
    const fetchMock = mockApi({
      'GET /api/ai-providers': () => ({ body: [provider()] }),
      'PATCH /api/ai-providers/p1': () => ({ body: provider() }),
      'POST /api/ai-providers/p1/test': () => ({ body: provider() }),
    })
    const { user } = renderWithClient(<ProviderManager />)
    const input = await screen.findByLabelText('Nova chave')
    expect(input).toHaveValue('')
    await user.type(input, 'sk-new-1234567890')
    await user.click(screen.getByRole('button', { name: 'Trocar chave' }))
    await vi.waitFor(() => expect(bodyOf(fetchMock, 'PATCH')).toEqual({ apiKey: 'sk-new-1234567890' }))

    await user.click(screen.getByRole('button', { name: 'Testar de novo' }))
    await vi.waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/p1/test'))).toBe(true))
  })
})
