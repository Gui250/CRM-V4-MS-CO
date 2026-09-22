import { screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Connection } from '@/lib/types'
import { mockApi, renderWithClient } from '@/test/render'
import { QrCodeCard } from './qr-code-card'

afterEach(() => vi.unstubAllGlobals())

const conn = (overrides: Partial<Connection>): Connection => ({
  status: 'disconnected',
  phoneNumber: null,
  qrCode: null,
  lastConnectedAt: null,
  ...overrides,
})

describe('QrCodeCard', () => {
  it('lets an admin connect when disconnected and stores the returned QR', async () => {
    mockApi({ 'POST /api/connection/connect': () => ({ body: conn({ status: 'awaiting_qr', qrCode: 'data:image/png;base64,QR' }) }) })
    const { user, client } = renderWithClient(<QrCodeCard connection={conn({})} isAdmin />)

    await user.click(screen.getByRole('button', { name: 'Conectar' }))

    await vi.waitFor(() => expect(client.getQueryData(['connection'])).toMatchObject({ status: 'awaiting_qr' }))
  })

  it('hides actions from attendants and tells them to ask an admin', () => {
    renderWithClient(<QrCodeCard connection={conn({})} isAdmin={false} />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.getByText(/Peça a um administrador/)).toBeInTheDocument()
  })

  it('shows the QR image and instructions while awaiting', () => {
    renderWithClient(<QrCodeCard connection={conn({ status: 'awaiting_qr', qrCode: 'data:image/png;base64,QR' })} isAdmin />)
    expect(screen.getByRole('img', { name: 'QR Code para conectar o WhatsApp' })).toHaveAttribute('src', 'data:image/png;base64,QR')
    expect(screen.getByText(/Aparelhos conectados/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Gerar novo QR Code' })).toBeInTheDocument()
  })

  it('shows the phone when connected and offers Desconectar to admins', () => {
    renderWithClient(<QrCodeCard connection={conn({ status: 'connected', phoneNumber: '5511987654321', lastConnectedAt: '2026-09-22T12:00:00Z' })} isAdmin />)
    expect(screen.getByText('+55 11 98765-4321')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Desconectar' })).toBeInTheDocument()
  })

  it('shows the API error when connecting fails', async () => {
    mockApi({ 'POST /api/connection/connect': () => ({ status: 502, body: { code: 'EVOLUTION_UNAVAILABLE', message: 'Não foi possível falar com o WhatsApp (sem resposta).' } }) })
    const { user } = renderWithClient(<QrCodeCard connection={conn({})} isAdmin />)

    await user.click(screen.getByRole('button', { name: 'Conectar' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível falar com o WhatsApp')
  })
})
