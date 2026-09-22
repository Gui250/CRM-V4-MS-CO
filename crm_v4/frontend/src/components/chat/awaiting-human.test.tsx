import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { conversation, page } from '@/test/fixtures'
import { mockApi, renderWithClient } from '@/test/render'
import { ConversationList } from './conversation-list'
import { ConversationSearch } from './conversation-search'

afterEach(() => vi.unstubAllGlobals())

const handedOff = {
  mode: 'human' as const,
  reason: 'Pediu uma pessoa',
  summary: null,
  handoffAt: '2026-09-22T12:00:00.000Z',
  assumedBy: null,
}

describe('"Aguardando humano" in the chat list', () => {
  it('toggles the filter from the search box', () => {
    const onChange = vi.fn()
    render(<ConversationSearch value={{ search: '', unread: false }} onChange={onChange} />)
    fireEvent.click(screen.getByLabelText('Aguardando humano'))
    expect(onChange).toHaveBeenCalledWith({ search: '', unread: false, awaitingHuman: true })
  })

  it('asks the API for awaiting conversations and badges them', async () => {
    const fetchMock = mockApi({ 'GET /api/conversations': () => ({ body: page([conversation({ handling: handedOff })]) }) })
    renderWithClient(<ConversationList filters={{ search: '', unread: false, awaitingHuman: true }} selectedId={null} onSelect={vi.fn()} />)
    expect(await screen.findByText('Aguardando humano')).toBeInTheDocument()
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('handling=awaiting_human')
  })
})
