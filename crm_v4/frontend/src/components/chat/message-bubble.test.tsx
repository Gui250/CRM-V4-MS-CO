import { screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { message } from '@/test/fixtures'
import { mockApi, renderWithClient } from '@/test/render'
import { MessageBubble } from './message-bubble'

afterEach(() => vi.unstubAllGlobals())

describe('MessageBubble', () => {
  it('labels messages sent by a flow or an AI agent', () => {
    renderWithClient(<MessageBubble message={message({ direction: 'outbound', status: 'sent', automation: { kind: 'agent', name: 'Qualificação' } })} />)
    expect(screen.getByText('IA: Qualificação')).toBeInTheDocument()
  })

  it('renders inbound text with its time and no status', () => {
    renderWithClient(<MessageBubble message={message({ body: 'Bom dia!', sentAt: new Date(2026, 8, 22, 8, 30).toISOString() })} />)
    expect(screen.getByText('Bom dia!')).toBeInTheDocument()
    expect(screen.getByText('08:30')).toBeInTheDocument()
    expect(screen.queryByLabelText(/Enviada|Entregue|Lida/)).not.toBeInTheDocument()
  })

  it.each([
    ['pending', 'Enviando'],
    ['sent', 'Enviada'],
    ['delivered', 'Entregue'],
    ['read', 'Lida'],
  ] as const)('shows the %s status mark on outbound messages', (status, label) => {
    renderWithClient(<MessageBubble message={message({ direction: 'outbound', status })} />)
    expect(screen.getByLabelText(label)).toBeInTheDocument()
  })

  it('labels outbound messages with the attendant who sent them', () => {
    renderWithClient(<MessageBubble message={message({ direction: 'outbound', status: 'sent', sentBy: { id: 'u', name: 'Bruno' } })} />)
    expect(screen.getByText('Bruno')).toBeInTheDocument()
  })

  it('offers Reenviar on failed messages and reports the retried message', async () => {
    mockApi({ 'POST /api/messages/m1/retry': () => ({ status: 202, body: message({ direction: 'outbound', status: 'sent' }) }) })
    const onRetried = vi.fn()
    const { user } = renderWithClient(<MessageBubble message={message({ direction: 'outbound', status: 'failed' })} onRetried={onRetried} />)

    expect(screen.getByText('Falhou')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Reenviar' }))
    await vi.waitFor(() => expect(onRetried).toHaveBeenCalledWith(expect.objectContaining({ status: 'sent' })))
  })

  it('shows unsupported types as an informative bubble', () => {
    renderWithClient(<MessageBubble message={message({ type: 'unsupported', body: null })} />)
    expect(screen.getByText('Tipo de mensagem não suportado')).toBeInTheDocument()
  })
})
