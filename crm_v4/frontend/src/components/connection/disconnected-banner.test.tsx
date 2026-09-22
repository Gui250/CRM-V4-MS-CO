import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DisconnectedBanner } from './disconnected-banner'

const base = { phoneNumber: null, qrCode: null, lastConnectedAt: null }

describe('DisconnectedBanner', () => {
  it('warns when the number is not connected, with a link to the connection page', () => {
    render(<DisconnectedBanner connection={{ ...base, status: 'disconnected' }} />)
    expect(screen.getByRole('alert')).toHaveTextContent('WhatsApp desconectado.')
    expect(screen.getByRole('link', { name: 'Ver conexão' })).toHaveAttribute('href', '/conexao')
  })

  it('renders nothing when connected or still loading', () => {
    const { container, rerender } = render(<DisconnectedBanner connection={{ ...base, status: 'connected' }} />)
    expect(container).toBeEmptyDOMElement()
    rerender(<DisconnectedBanner connection={undefined} />)
    expect(container).toBeEmptyDOMElement()
  })
})
