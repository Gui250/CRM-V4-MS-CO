import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import '@/test/next-navigation'
import { PanelNav } from './panel-nav'

describe('PanelNav', () => {
  it('shows Automações only to admins', () => {
    const { unmount } = render(<PanelNav role="admin" />)
    expect(screen.getByRole('link', { name: 'Automações' })).toHaveAttribute('href', '/automacoes')
    unmount()
    render(<PanelNav role="attendant" />)
    expect(screen.queryByRole('link', { name: 'Automações' })).not.toBeInTheDocument()
  })

  it('shows Relatórios to everyone and Fontes de dados only to admins', () => {
    const { unmount } = render(<PanelNav role="admin" />)
    expect(screen.getByRole('link', { name: 'Fontes de dados' })).toHaveAttribute('href', '/fontes')
    unmount()
    render(<PanelNav role="attendant" />)
    expect(screen.getByRole('link', { name: 'Relatórios' })).toHaveAttribute('href', '/relatorios')
    expect(screen.queryByRole('link', { name: 'Fontes de dados' })).not.toBeInTheDocument()
  })
})
