import { screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockApi, renderWithClient } from '@/test/render'
import { StartFlowMenu } from './start-flow-menu'

afterEach(() => vi.unstubAllGlobals())

const flows = [{ id: 'f1', name: 'Follow-up de proposta', description: 'Lembra o cliente da proposta', status: 'active', trigger: 'manual' }]

describe('StartFlowMenu', () => {
  it('lists active flows and starts the confirmed one', async () => {
    const fetchMock = mockApi({
      'GET /api/flows?status=active': () => ({ body: flows }),
      'POST /api/conversations/c1/start-flow': () => ({ status: 201, body: { id: 'r1', conversationId: 'c1' } }),
    })
    const { user } = renderWithClient(<StartFlowMenu conversationId="c1" />)
    await user.click(screen.getByRole('button', { name: 'Automações' }))
    await user.click(await screen.findByRole('menuitem', { name: /Follow-up de proposta/ }))
    expect(screen.getByText('Disparar Follow-up de proposta?')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Confirmar' }))

    await vi.waitFor(() => expect(screen.queryByText('Disparar Follow-up de proposta?')).not.toBeInTheDocument())
    const call = fetchMock.mock.calls.find(([url]) => url === '/api/conversations/c1/start-flow')!
    expect(JSON.parse(String(call[1]!.body))).toEqual({ flowId: 'f1' })
  })

  it('shows the empty state', async () => {
    mockApi({ 'GET /api/flows?status=active': () => ({ body: [] }) })
    const { user } = renderWithClient(<StartFlowMenu conversationId="c1" />)
    await user.click(screen.getByRole('button', { name: 'Automações' }))
    expect(await screen.findByText('Nenhum fluxo ativo.')).toBeInTheDocument()
  })

  it('shows why the flow could not start', async () => {
    mockApi({
      'GET /api/flows?status=active': () => ({ body: flows }),
      'POST /api/conversations/c1/start-flow': () => ({
        status: 409,
        body: { code: 'RUN_ALREADY_ACTIVE', message: 'Já existe uma automação em andamento nesta conversa.' },
      }),
    })
    const { user } = renderWithClient(<StartFlowMenu conversationId="c1" />)
    await user.click(screen.getByRole('button', { name: 'Automações' }))
    await user.click(await screen.findByRole('menuitem', { name: /Follow-up/ }))
    await user.click(screen.getByRole('button', { name: 'Confirmar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Já existe uma automação em andamento nesta conversa.')
  })
})
