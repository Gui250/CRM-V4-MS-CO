import { screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { navigation } from '@/test/next-navigation'
import { makeDefinition, makePage, makeVisual } from '@/lib/bi/test-helpers'
import type { Report } from '@/lib/bi/types'
import type { User } from '@/lib/types'
import { makeReport, mockBiApi } from '@/components/bi/test-utils'
import { renderWithClient } from '@/test/render'
import ReportPage from './page'

vi.mock('@/components/bi/visuals/echart', async () => ({ EChart: (await import('@/components/bi/test-utils')).FakeEChart }))

const me: User = { id: 'u1', name: 'Ana', email: 'a@x.com', role: 'attendant', status: 'active', createdAt: '2026-09-22T12:00:00.000Z' }

beforeEach(() => {
  navigation.params = { id: 'r1' }
})
afterEach(() => {
  vi.unstubAllGlobals()
  navigation.params = {}
})

function setup(report: Report) {
  const fetchMock = mockBiApi({ 'GET /api/auth/me': () => ({ body: me }), 'GET /api/bi/reports/r1': () => ({ body: report }) })
  return { fetchMock, ...renderWithClient(<ReportPage />) }
}

const withText = makeDefinition({ pages: [makePage({ visuals: [makeVisual({ id: 't', type: 'text', title: 'Aviso', options: { limit: 20, crossFilter: true, text: 'Olá' } })] })] })

describe('Relatório page', () => {
  it('opens the editor for the owner', async () => {
    setup(makeReport())
    expect(await screen.findByRole('button', { name: 'Salvo' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Compartilhar' })).toBeInTheDocument()
  })

  it('opens the read-only viewer for view permission, without edit controls or saves', async () => {
    const { fetchMock } = setup(makeReport({ permission: 'view', definition: withText }))
    expect(await screen.findByRole('heading', { name: 'Atendimento' })).toBeInTheDocument()
    expect(screen.getByText('Olá')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Salv/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Compartilhar' })).not.toBeInTheDocument()
    expect(fetchMock.mock.calls.some(([, init]) => (init as RequestInit | undefined)?.method === 'PUT')).toBe(false)
  })

  it('shows the viewer to editors on small screens', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
    setup(makeReport({ definition: withText }))
    expect(await screen.findByText('Olá')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Salv/ })).not.toBeInTheDocument()
  })

  it('says when the report is not available', async () => {
    mockBiApi({ 'GET /api/auth/me': () => ({ body: me }), 'GET /api/bi/reports/r1': () => ({ status: 404, body: { code: 'NOT_FOUND', message: 'x' } }) })
    renderWithClient(<ReportPage />)
    expect(await screen.findByText('Relatório indisponível')).toBeInTheDocument()
  })
})
