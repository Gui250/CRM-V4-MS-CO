import { act, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { bumpConversation } from '@/lib/chat-cache'
import { conversation, page } from '@/test/fixtures'
import { navigation, router } from '@/test/next-navigation'
import { mockApi, renderWithClient } from '@/test/render'
import ChatPage from './page'

const connected = { status: 'connected', phoneNumber: '55', qrCode: null, lastConnectedAt: null }

beforeEach(() => {
  navigation.searchParams = new URLSearchParams()
  navigation.pathname = '/chat'
})
afterEach(() => {
  vi.unstubAllGlobals()
  router.replace.mockReset()
})

function api(conversations = [conversation({ id: 'c1', unreadCount: 2 }), conversation({ id: 'c2', contact: { id: 'x', phone: '5521', name: 'Bruno', avatarUrl: null } })]) {
  return mockApi({
    'GET /api/conversations': () => ({ body: page(conversations) }),
    'GET /api/connection': () => ({ body: connected }),
    'GET /api/conversations/c1/messages': () => ({ body: page([]) }),
    'POST /api/conversations/c1/read': () => ({ status: 204 }),
  })
}

const readCalls = (fetchMock: ReturnType<typeof api>) =>
  fetchMock.mock.calls.filter(([url, init]) => String(url) === '/api/conversations/c1/read' && init?.method === 'POST')

describe('chat page', () => {
  it('selecting a conversation writes ?c= to the URL', async () => {
    api()
    const { user } = renderWithClient(<ChatPage />)
    await user.click(await screen.findByText('Bruno'))
    expect(router.replace).toHaveBeenCalledWith('/chat?c=c2', { scroll: false })
  })

  it('marks the open conversation as read, and again when a new message arrives', async () => {
    navigation.searchParams = new URLSearchParams('c=c1')
    const fetchMock = api()
    const { client } = renderWithClient(<ChatPage />)

    await waitFor(() => expect(readCalls(fetchMock)).toHaveLength(1))
    expect(await screen.findByRole('heading', { name: 'Cliente Silva' })).toBeInTheDocument()

    act(() => bumpConversation(client, conversation({ id: 'c1', unreadCount: 1, lastMessagePreview: 'nova' })))
    await waitFor(() => expect(readCalls(fetchMock)).toHaveLength(2))
  })

  it('shows the empty state until a conversation is chosen', async () => {
    api()
    renderWithClient(<ChatPage />)
    expect(await screen.findByText('Escolha uma conversa na lista para ler e responder.')).toBeInTheDocument()
  })

  it('on small screens shows either the list or the thread, with a back button', async () => {
    navigation.searchParams = new URLSearchParams('c=c1')
    api()
    const { user } = renderWithClient(<ChatPage />)

    const list = (await screen.findByRole('heading', { name: 'Conversas' })).closest('aside')!
    expect(list.className).toContain('hidden md:flex')

    await user.click(screen.getByRole('button', { name: 'Voltar para conversas' }))
    expect(router.replace).toHaveBeenCalledWith('/chat', { scroll: false })
  })
})
