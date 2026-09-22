import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { navigation } from '@/test/next-navigation'
import { AutomationSubnav } from './automation-subnav'

describe('AutomationSubnav', () => {
  it('links the three sections and marks the current one', () => {
    navigation.pathname = '/automacoes/agentes'
    render(<AutomationSubnav />)
    expect(screen.getByRole('link', { name: 'Fluxos' })).toHaveAttribute('href', '/automacoes')
    expect(screen.getByRole('link', { name: 'Provedores de IA' })).toHaveAttribute('href', '/automacoes/provedores')
    expect(screen.getByRole('link', { name: 'Agentes' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Fluxos' })).not.toHaveAttribute('aria-current')
  })
})
