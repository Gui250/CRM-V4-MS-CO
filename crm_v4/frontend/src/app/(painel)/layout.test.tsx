import { screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FakeEventSource } from '@/test/fake-event-source'
import { router } from '@/test/next-navigation'
import { mockApi, renderWithClient } from '@/test/render'
import PanelLayout from './layout'

const connected = () => ({ body: { status: 'connected', phoneNumber: '55', qrCode: null, lastConnectedAt: null } })

beforeEach(() => vi.stubGlobal('EventSource', FakeEventSource))
afterEach(() => {
  vi.unstubAllGlobals()
  router.replace.mockReset()
})

const me = (role: 'admin' | 'attendant') => ({ id: '1', name: 'Ana', email: 'a@x.com', role, status: 'active', createdAt: '' })

describe('panel layout', () => {
  it('redirects to /login when there is no session', async () => {
    // A non-UNAUTHENTICATED error skips apiFetch's own redirect, isolating the layout's fallback.
    mockApi({ 'GET /api/auth/me': () => ({ status: 403, body: { code: 'FORBIDDEN', message: 'x' } }) })
    renderWithClient(<PanelLayout>conteúdo</PanelLayout>)
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/login'))
    expect(screen.queryByText('conteúdo')).not.toBeInTheDocument()
  })

  it('shows Usuários only to admins', async () => {
    mockApi({ 'GET /api/auth/me': () => ({ body: me('attendant') }), 'GET /api/connection': connected })
    renderWithClient(<PanelLayout>conteúdo</PanelLayout>)
    expect(await screen.findByText('conteúdo')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Usuários' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Chat' })).toHaveAttribute('aria-current', 'page')
  })

  it('shows the disconnected banner when the number is not connected', async () => {
    mockApi({
      'GET /api/auth/me': () => ({ body: me('attendant') }),
      'GET /api/connection': () => ({ body: { status: 'disconnected', phoneNumber: null, qrCode: null, lastConnectedAt: null } }),
    })
    renderWithClient(<PanelLayout>conteúdo</PanelLayout>)
    expect(await screen.findByText('WhatsApp desconectado.')).toBeInTheDocument()
  })

  it('shows Usuários to admins', async () => {
    mockApi({ 'GET /api/auth/me': () => ({ body: me('admin') }), 'GET /api/connection': connected })
    renderWithClient(<PanelLayout>conteúdo</PanelLayout>)
    expect(await screen.findByRole('link', { name: 'Usuários' })).toBeInTheDocument()
  })

  it('logs out and goes to /login', async () => {
    const fetchMock = mockApi({
      'GET /api/auth/me': () => ({ body: me('admin') }),
      'GET /api/connection': connected,
      'POST /api/auth/logout': () => ({ status: 204 }),
    })
    const { user } = renderWithClient(<PanelLayout>conteúdo</PanelLayout>)
    await user.click(await screen.findByRole('button', { name: 'Sair' }))
    expect(fetchMock.mock.calls.some(([url, init]) => String(url) === '/api/auth/logout' && init?.method === 'POST')).toBe(true)
    expect(router.replace).toHaveBeenCalledWith('/login')
  })
})
