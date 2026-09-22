import { screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RunSummary } from '@/lib/automation-types'
import { mockApi, renderWithClient } from '@/test/render'
import { formatDuration, RunList } from './run-list'

const run = (overrides: Partial<RunSummary>): RunSummary => ({
  id: 'r1',
  flowId: 'f1',
  flowName: 'Boas-vindas',
  versionNumber: 1,
  conversationId: 'c1',
  contact: { name: 'Maria', phone: '5511999999999' },
  origin: 'message_received',
  status: 'completed',
  currentNodeId: null,
  isTest: false,
  startedAt: '2026-09-22T10:00:00',
  finishedAt: '2026-09-22T10:00:12',
  endReason: 'completed',
  error: null,
  ...overrides,
})

afterEach(() => vi.unstubAllGlobals())

describe('formatDuration', () => {
  it('formats short and long durations', () => {
    expect(formatDuration(850)).toBe('850 ms')
    expect(formatDuration(12_000)).toBe('12 s')
    expect(formatDuration(185_000)).toBe('3 min 5 s')
    expect(formatDuration(7_800_000)).toBe('2 h 10 min')
  })
})

describe('RunList', () => {
  it('shows status, contact, start, duration, test badge and links to the detail', async () => {
    mockApi({
      'GET /api/flows/f1/runs': () => ({
        body: { items: [run({}), run({ id: 'r2', status: 'waiting', finishedAt: null, isTest: true, contact: { name: null, phone: '5511988887777' } })], nextCursor: null },
      }),
    })
    renderWithClient(<RunList flowId="f1" />)

    const list = await screen.findByRole('list')
    const done = within(list).getByText('Concluída').closest('a')!
    expect(done).toHaveAttribute('href', '/automacoes/execucoes/r1')
    expect(within(done).getByText('Maria')).toBeInTheDocument()
    expect(within(done).getByText('22/09/2026 10:00')).toBeInTheDocument()
    expect(within(done).getByText('12 s')).toBeInTheDocument()

    const waiting = within(list).getByText('Aguardando').closest('a')!
    expect(within(waiting).getByText('teste')).toBeInTheDocument()
    expect(within(waiting).getByText('—')).toBeInTheDocument()
    expect(within(waiting).getByText(/98888-7777/)).toBeInTheDocument()
  })

  it('filters by status and loads more pages', async () => {
    const fetchMock = mockApi({
      'GET /api/flows/f1/runs': (_, url) => {
        if (url.searchParams.get('cursor') === 'next') return { body: { items: [run({ id: 'r9', contact: { name: 'Página 2', phone: '1' } })], nextCursor: null } }
        if (url.searchParams.get('status') === 'failed') return { body: { items: [run({ id: 'rf', status: 'failed' })], nextCursor: null } }
        return { body: { items: [run({})], nextCursor: 'next' } }
      },
    })
    const { user } = renderWithClient(<RunList flowId="f1" />)

    await user.click(await screen.findByRole('button', { name: 'Carregar mais' }))
    expect(await screen.findByText('Página 2')).toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText('Situação'), 'failed')
    expect(await within(screen.getByRole('list')).findByText('Falhou')).toBeInTheDocument()
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('status=failed'))).toBe(true)
  })

  it('shows an empty state', async () => {
    mockApi({ 'GET /api/flows/f1/runs': () => ({ body: { items: [], nextCursor: null } }) })
    renderWithClient(<RunList flowId="f1" />)
    expect(await screen.findByText('Nenhuma execução encontrada.')).toBeInTheDocument()
  })
})
