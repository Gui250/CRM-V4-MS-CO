import { screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Flow, FlowGraph } from '@/lib/automation-types'
import { router } from '@/test/next-navigation'
import { mockApi, renderWithClient } from '@/test/render'
import { FlowEditor } from './flow-editor'

const graph: FlowGraph = {
  nodes: [
    { id: 't1', type: 'trigger.message_received', position: { x: 0, y: 0 }, config: { match: 'any' } },
    { id: 's1', type: 'send_text', position: { x: 0, y: 150 }, config: { text: 'Olá!' } },
  ],
  edges: [{ id: 'e1', source: 't1', sourceHandle: 'next', target: 's1' }],
}

const flow = (overrides: Partial<Flow> = {}): Flow => ({
  id: 'f1',
  name: 'Boas-vindas',
  description: null,
  status: 'draft',
  trigger: 'message_received',
  priority: 100,
  versionNumber: 1,
  updatedAt: '2026-09-22T12:00:00Z',
  lastRunAt: null,
  graph,
  ...overrides,
})

const bodyOf = (fetchMock: ReturnType<typeof mockApi>, method: string) =>
  JSON.parse(String(fetchMock.mock.calls.find(([, init]) => init?.method === method)![1]!.body)) as FlowGraph

const calls = (fetchMock: ReturnType<typeof mockApi>) => fetchMock.mock.calls.map(([url, init]) => `${init?.method ?? 'GET'} ${new URL(String(url), 'http://x').pathname}`)

beforeEach(() => router.push.mockClear())
afterEach(() => vi.unstubAllGlobals())

describe('FlowEditor', () => {
  it('renders the saved blocks, the name and the status', () => {
    mockApi({})
    renderWithClient(<FlowEditor flow={flow()} />)
    expect(screen.getByRole('heading', { name: 'Boas-vindas' })).toBeInTheDocument()
    expect(screen.getByText('Rascunho')).toBeInTheDocument()
    expect(screen.getByTestId('block-trigger.message_received')).toBeInTheDocument()
    expect(screen.getByTestId('block-send_text')).toHaveTextContent('Olá!')
    expect(screen.getByRole('link', { name: '← Automações' })).toHaveAttribute('href', '/automacoes')
    expect(screen.getByRole('link', { name: 'Execuções' })).toHaveAttribute('href', '/automacoes/f1/execucoes')
  })

  it('adds a block from the palette, selects it and edits it in the panel', async () => {
    mockApi({})
    const { user } = renderWithClient(<FlowEditor flow={flow({ graph: null })} />)
    expect(screen.getByText('Fluxo vazio: adicione um gatilho pela paleta.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Adicionar Enviar texto' }))
    const panel = screen.getByRole('region', { name: 'Configurar Enviar texto' })
    await user.type(within(panel).getByLabelText('Mensagem'), 'Oi')
    expect(screen.getByTestId('block-send_text')).toHaveTextContent('Oi')

    await user.click(screen.getByRole('button', { name: 'Remover bloco' }))
    expect(screen.queryByTestId('block-send_text')).not.toBeInTheDocument()
  })

  it('allows one trigger only', async () => {
    mockApi({})
    const { user } = renderWithClient(<FlowEditor flow={flow({ graph: null })} />)
    await user.click(screen.getByRole('button', { name: 'Adicionar Disparo manual' }))
    expect(screen.getByRole('button', { name: 'Adicionar Mensagem recebida' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Adicionar Disparo manual' })).toBeDisabled()
  })

  it('saves the graph and shows the new version', async () => {
    const fetchMock = mockApi({
      'PUT /api/flows/f1/graph': () => ({ body: flow({ versionNumber: 2 }) }),
    })
    const { user } = renderWithClient(<FlowEditor flow={flow()} />)
    await user.click(screen.getByRole('button', { name: 'Adicionar Encerrar' }))
    await user.click(screen.getByRole('button', { name: 'Salvar' }))

    expect(await screen.findByText('Fluxo salvo.')).toBeInTheDocument()
    const body = bodyOf(fetchMock, 'PUT')
    expect(body.nodes.map((n) => n.type)).toEqual(['trigger.message_received', 'send_text', 'end'])
    expect(body.edges).toEqual([{ id: 'e1', source: 't1', sourceHandle: 'next', target: 's1' }])
  })

  it('highlights the blocks named by a 422 and shows graph-level issues', async () => {
    mockApi({
      'PUT /api/flows/f1/graph': () => ({
        status: 422,
        body: {
          code: 'INVALID_FLOW',
          message: 'O fluxo tem problemas.',
          issues: [{ nodeId: 's1', message: 'Informe a mensagem.' }, { message: 'O fluxo precisa de um gatilho.' }],
        },
      }),
    })
    const { user } = renderWithClient(<FlowEditor flow={flow()} />)
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Adicionar Encerrar' }))
    await user.click(screen.getByRole('button', { name: 'Salvar' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('O fluxo tem problemas. O fluxo precisa de um gatilho.')
    expect(screen.getByTestId('block-send_text')).toHaveTextContent('Informe a mensagem.')
  })

  it('saves pending changes before activating and shows the flow as active', async () => {
    const fetchMock = mockApi({
      'PUT /api/flows/f1/graph': () => ({ body: flow({ versionNumber: 2 }) }),
      'POST /api/flows/f1/activate': () => ({ body: flow({ status: 'active', versionNumber: 2 }) }),
      'GET /api/flows': () => ({ body: [] }),
    })
    const { user } = renderWithClient(<FlowEditor flow={flow()} />)
    await user.click(screen.getByRole('button', { name: 'Adicionar Encerrar' }))
    await user.click(screen.getByRole('button', { name: 'Ativar' }))

    expect(await screen.findByText('Ativo')).toBeInTheDocument()
    const sequence = calls(fetchMock).filter((c) => !c.startsWith('GET'))
    expect(sequence).toEqual(['PUT /api/flows/f1/graph', 'POST /api/flows/f1/activate'])
    expect(screen.getByRole('button', { name: 'Desativar' })).toBeInTheDocument()
  })

  it('deactivates an active flow', async () => {
    mockApi({
      'POST /api/flows/f1/deactivate': () => ({ body: flow({ status: 'inactive' }) }),
      'GET /api/flows': () => ({ body: [] }),
    })
    const { user } = renderWithClient(<FlowEditor flow={flow({ status: 'active' })} />)
    await user.click(screen.getByRole('button', { name: 'Desativar' }))
    expect(await screen.findByText('Inativo')).toBeInTheDocument()
  })

  it('shows the API error when activation fails for another reason', async () => {
    mockApi({
      'POST /api/flows/f1/activate': () => ({ status: 404, body: { code: 'NOT_FOUND', message: 'Fluxo não encontrado.' } }),
    })
    const { user } = renderWithClient(<FlowEditor flow={flow()} />)
    await user.click(screen.getByRole('button', { name: 'Ativar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Fluxo não encontrado.')
  })

  it('is read-only on small screens but still activates and deactivates', () => {
    mockApi({})
    renderWithClient(<FlowEditor flow={flow()} readOnly />)
    expect(screen.getByText(/A edição exige uma tela maior/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Adicionar/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Salvar' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ativar' })).toBeInTheDocument()
    expect(screen.getByTestId('block-send_text')).toBeInTheDocument()
  })

  it('warns before leaving with unsaved changes', async () => {
    mockApi({})
    const confirm = vi.fn(() => false)
    vi.stubGlobal('confirm', confirm)
    const { user } = renderWithClient(<FlowEditor flow={flow()} />)
    await user.click(screen.getByRole('button', { name: 'Adicionar Encerrar' }))
    await user.click(screen.getByRole('link', { name: '← Automações' }))
    expect(confirm).toHaveBeenCalledWith('Há alterações não salvas. Sair mesmo assim?')
    expect(router.push).not.toHaveBeenCalled()
  })
})
