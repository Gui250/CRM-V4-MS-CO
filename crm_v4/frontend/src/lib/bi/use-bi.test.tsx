import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockApi } from '@/test/render'
import { makeDefinition } from './test-helpers'
import type { QueryRequest } from './types'
import { isReportConflict, useSaveReport, useSources, useVisualQuery } from './use-bi'

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const Wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
  return { client, Wrapper }
}

const request: QueryRequest = { sourceId: 's', dimensions: [], measures: [], filters: [], calculatedFields: [], limit: 20, groupOthers: true }

afterEach(() => vi.unstubAllGlobals())

describe('use-bi', () => {
  it('useSources lists sources', async () => {
    mockApi({ 'GET /api/bi/sources': () => ({ body: [{ id: 's', name: 'Mensagens' }] }) })
    const { Wrapper } = wrapper()
    const { result } = renderHook(() => useSources(), { wrapper: Wrapper })
    await waitFor(() => expect(result.current.data).toEqual([{ id: 's', name: 'Mensagens' }]))
  })

  it('useVisualQuery posts the request and stays idle for null', async () => {
    const fetchMock = mockApi({ 'POST /api/bi/query': (init) => ({ body: { echoed: JSON.parse(String(init?.body)) } }) })
    const { Wrapper } = wrapper()
    const idle = renderHook(() => useVisualQuery(null), { wrapper: Wrapper })
    expect(idle.result.current.fetchStatus).toBe('idle')
    const { result } = renderHook(() => useVisualQuery(request), { wrapper: Wrapper })
    await waitFor(() => expect(result.current.data).toEqual({ echoed: request }))
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('useSaveReport surfaces REPORT_CONFLICT', async () => {
    mockApi({ 'PUT /api/bi/reports/r1': () => ({ status: 409, body: { code: 'REPORT_CONFLICT', message: 'Outra pessoa salvou.' } }) })
    const { Wrapper } = wrapper()
    const { result } = renderHook(() => useSaveReport(), { wrapper: Wrapper })
    await act(() => result.current.mutateAsync({ id: 'r1', name: 'x', definition: makeDefinition(), version: 1 }).catch(() => undefined))
    await waitFor(() => expect(isReportConflict(result.current.error)).toBe(true))
  })

  it('useSaveReport caches the saved report', async () => {
    const saved = { id: 'r1', name: 'x', version: 2 }
    mockApi({ 'PUT /api/bi/reports/r1': () => ({ body: saved }) })
    const { Wrapper, client } = wrapper()
    const { result } = renderHook(() => useSaveReport(), { wrapper: Wrapper })
    await act(() => result.current.mutateAsync({ id: 'r1', name: 'x', definition: makeDefinition(), version: 1 }))
    expect(client.getQueryData(['bi-reports', 'r1'])).toEqual(saved)
  })
})
