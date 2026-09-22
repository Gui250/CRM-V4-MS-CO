import '@/test/next-navigation'
import { screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockApi, renderWithClient } from '@/test/render'
import SourcesPage from './page'

const me = (role: 'admin' | 'attendant') => ({ id: 'u', name: 'U', email: 'u@x.com', role, status: 'active', createdAt: '2026-01-01T00:00:00Z' })

afterEach(() => vi.unstubAllGlobals())

describe('SourcesPage', () => {
  it('blocks non-admins', async () => {
    mockApi({ 'GET /api/auth/me': () => ({ body: me('attendant') }) })
    renderWithClient(<SourcesPage />)
    expect(await screen.findByText('Apenas administradores gerenciam fontes de dados.')).toBeInTheDocument()
  })

  it('shows sources, CRM data and relationships to admins', async () => {
    mockApi({
      'GET /api/auth/me': () => ({ body: me('admin') }),
      'GET /api/bi/sources': () => ({ body: [] }),
      'GET /api/bi/relationships': () => ({ body: [] }),
    })
    renderWithClient(<SourcesPage />)
    expect(await screen.findByRole('link', { name: 'Nova fonte' })).toHaveAttribute('href', '/fontes/nova')
    expect(await screen.findByRole('heading', { name: 'Dados do CRM' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Relacionamentos' })).toBeInTheDocument()
  })
})
