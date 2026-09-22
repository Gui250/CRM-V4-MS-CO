import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FakeEventSource } from '@/test/fake-event-source'
import type { RunSummary } from './automation-types'
import { automationKeys } from './use-automation'
import { useEvents } from './use-events'

let client: QueryClient

beforeEach(() => {
  FakeEventSource.instances = []
  vi.stubGlobal('EventSource', FakeEventSource)
  client = new QueryClient()
})
afterEach(() => vi.unstubAllGlobals())

const run = (overrides: Partial<RunSummary> = {}): RunSummary => ({
  id: 'r1',
  flowId: 'f1',
  flowName: 'Boas-vindas',
  versionNumber: 1,
  conversationId: 'c1',
  contact: { name: 'Ana', phone: '5511' },
  origin: 'message_received',
  status: 'running',
  currentNodeId: 'n1',
  isTest: false,
  startedAt: '2026-09-22T12:00:00.000Z',
  finishedAt: null,
  endReason: null,
  error: null,
  ...overrides,
})

const mount = () =>
  renderHook(() => useEvents(), { wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> })

describe('useEvents: run.updated', () => {
  it('puts the active run first in the conversation runs and replaces updates', () => {
    const key = automationKeys.conversationRuns('c1')
    client.setQueryData(key, [run({ id: 'old', status: 'completed' })])
    mount()
    FakeEventSource.latest().emit('run.updated', { run: run() })
    expect(client.getQueryData<RunSummary[]>(key)?.map((r) => r.id)).toEqual(['r1', 'old'])

    FakeEventSource.latest().emit('run.updated', { run: run({ status: 'completed' }) })
    expect(client.getQueryData<RunSummary[]>(key)?.map((r) => [r.id, r.status])).toEqual([
      ['r1', 'completed'],
      ['old', 'completed'],
    ])
  })

  it('invalidates the flow history and the run detail', () => {
    const spy = vi.spyOn(client, 'invalidateQueries')
    mount()
    FakeEventSource.latest().emit('run.updated', { run: run() })
    expect(spy).toHaveBeenCalledWith({ queryKey: ['runs', 'f1'] })
    expect(spy).toHaveBeenCalledWith({ queryKey: automationKeys.run('r1') })
  })
})
