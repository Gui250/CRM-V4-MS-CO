import { screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockApi, renderWithClient } from '@/test/render'
import { NewConversationFlow } from './new-conversation-flow'

afterEach(() => vi.unstubAllGlobals())

const flows = { 'GET /api/flows?status=active': () => ({ body: [{ id: 'f1', name: 'Abordagem' }] }) }

describe('NewConversationFlow', () => {
  it('keeps only digits and validates the length', async () => {
    mockApi(flows)
    const { user } = renderWithClient(<NewConversationFlow onStarted={vi.fn()} />)
    await user.type(screen.getByLabelText('Número'), '+55 (11) 9')
    expect(screen.getByLabelText('Número')).toHaveValue('55119')
    await user.selectOptions(screen.getByLabelText('Fluxo'), await screen.findByRole('option', { name: 'Abordagem' }))
    await user.click(screen.getByRole('button', { name: 'Iniciar conversa' }))
    expect(screen.getByText('Informe de 10 a 15 dígitos, com DDI.')).toBeInTheDocument()
  })

  it('starts the flow and reports the new conversation', async () => {
    const fetchMock = mockApi({
      ...flows,
      'POST /api/conversations/start-flow': () => ({ status: 201, body: { conversation: { id: 'c9' }, run: { id: 'r1', conversationId: 'c9' } } }),
    })
    const onStarted = vi.fn()
    const { user } = renderWithClient(<NewConversationFlow onStarted={onStarted} />)
    await user.type(screen.getByLabelText('Número'), '5511999999999')
    await user.selectOptions(screen.getByLabelText('Fluxo'), await screen.findByRole('option', { name: 'Abordagem' }))
    await user.click(screen.getByRole('button', { name: 'Iniciar conversa' }))
    await vi.waitFor(() => expect(onStarted).toHaveBeenCalledWith('c9'))
    const call = fetchMock.mock.calls.find(([url]) => url === '/api/conversations/start-flow')!
    expect(JSON.parse(String(call[1]!.body))).toEqual({ phone: '5511999999999', flowId: 'f1' })
  })

  it('shows API errors such as numbers without WhatsApp', async () => {
    mockApi({
      ...flows,
      'POST /api/conversations/start-flow': () => ({ status: 422, body: { code: 'PHONE_NOT_ON_WHATSAPP', message: 'Este número não tem WhatsApp.' } }),
    })
    const { user } = renderWithClient(<NewConversationFlow onStarted={vi.fn()} />)
    await user.type(screen.getByLabelText('Número'), '5511999999999')
    await user.selectOptions(screen.getByLabelText('Fluxo'), await screen.findByRole('option', { name: 'Abordagem' }))
    await user.click(screen.getByRole('button', { name: 'Iniciar conversa' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Este número não tem WhatsApp.')
  })
})
