import { screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RunSummary } from '@/lib/automation-types'
import { mockApi, renderWithClient } from '@/test/render'
import { AutomationIndicator } from './automation-indicator'

afterEach(() => vi.unstubAllGlobals())

const run = (overrides: Partial<RunSummary> = {}): RunSummary => ({
  id: 'r1',
  flowId: 'f1',
  flowName: 'Follow-up',
  versionNumber: 1,
  conversationId: 'c1',
  contact: { name: 'Maria', phone: '5511' },
  origin: 'manual',
  status: 'running',
  currentNodeId: 'n1',
  isTest: false,
  startedAt: '2026-09-22T12:00:00Z',
  finishedAt: null,
  endReason: null,
  error: null,
  ...overrides,
})

describe('AutomationIndicator', () => {
  it('shows the active run and stops it', async () => {
    const fetchMock = mockApi({
      'GET /api/conversations/c1/runs': () => ({ body: [run()] }),
      'POST /api/runs/r1/cancel': () => ({ body: run({ status: 'cancelled' }) }),
    })
    const { user } = renderWithClient(<AutomationIndicator conversationId="c1" />)
    expect(await screen.findByRole('status')).toHaveTextContent('Automação em andamento: Follow-up')
    await user.click(screen.getByRole('button', { name: 'Parar' }))
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/runs/r1/cancel', expect.objectContaining({ method: 'POST' })))
  })

  it('uses waiting wording for waiting runs', async () => {
    mockApi({ 'GET /api/conversations/c1/runs': () => ({ body: [run({ status: 'waiting' })] }) })
    renderWithClient(<AutomationIndicator conversationId="c1" />)
    expect(await screen.findByRole('status')).toHaveTextContent('Automação aguardando: Follow-up')
  })

  it('renders nothing when the latest run has finished', async () => {
    const fetchMock = mockApi({ 'GET /api/conversations/c1/runs': () => ({ body: [run({ status: 'completed' })] }) })
    renderWithClient(<AutomationIndicator conversationId="c1" />)
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
