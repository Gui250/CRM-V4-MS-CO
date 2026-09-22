import { fireEvent, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { conversation, page } from '@/test/fixtures'
import { mockApi, renderWithClient } from '@/test/render'
import { ConversationList } from './conversation-list'

afterEach(() => vi.unstubAllGlobals())
const noFilters = { search: '', unread: false }

describe('ConversationList', () => {
  it('renders name, preview, time, unread badge and selection', async () => {
    const today = new Date()
    today.setHours(9, 7)
    mockApi({
      'GET /api/conversations': () => ({
        body: page([
          conversation({ id: 'c1', unreadCount: 3, lastMessagePreview: 'quero um orçamento', lastMessageAt: today.toISOString() }),
          conversation({ id: 'c2', contact: { id: 'x', phone: '5521912345678', name: null, avatarUrl: null } }),
        ]),
      }),
    })
    const onSelect = vi.fn()
    const { user } = renderWithClient(<ConversationList filters={noFilters} selectedId="c1" onSelect={onSelect} />)

    expect(await screen.findByText('Cliente Silva')).toBeInTheDocument()
    expect(screen.getByText('quero um orçamento')).toBeInTheDocument()
    expect(screen.getByText('09:07')).toBeInTheDocument()
    expect(screen.getByText('Não lidas:').parentElement).toHaveTextContent('3')
    expect(screen.getByText('+55 21 91234-5678')).toBeInTheDocument()
    expect(screen.getAllByRole('button')[0]).toHaveAttribute('aria-current', 'true')

    await user.click(screen.getByText('+55 21 91234-5678'))
    expect(onSelect).toHaveBeenCalledWith('c2')
  })

  it('falls back to initials when the avatar image fails', async () => {
    mockApi({ 'GET /api/conversations': () => ({ body: page([conversation({ contact: { id: 'x', phone: '55', name: 'Ana Souza', avatarUrl: 'https://pps/expired.jpg' } })]) }) })
    const { container } = renderWithClient(<ConversationList filters={noFilters} selectedId={null} onSelect={vi.fn()} />)

    await screen.findByText('Ana Souza')
    const img = container.querySelector('img')!
    fireEvent.error(img)

    expect(container.querySelector('img')).toBeNull()
    expect(screen.getByText('AS')).toBeInTheDocument()
  })

  it('passes filters to the API and shows the filtered empty state', async () => {
    const fetchMock = mockApi({ 'GET /api/conversations': () => ({ body: page([]) }) })
    renderWithClient(<ConversationList filters={{ search: 'ana', unread: true }} selectedId={null} onSelect={vi.fn()} />)

    expect(await screen.findByText('Nenhuma conversa encontrada.')).toBeInTheDocument()
    const url = new URL(String(fetchMock.mock.calls[0]![0]), 'http://x')
    expect(url.searchParams.get('search')).toBe('ana')
    expect(url.searchParams.get('unread')).toBe('true')
  })
})
