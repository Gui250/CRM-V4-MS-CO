import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'

export function renderWithClient(ui: React.ReactElement, client = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  return { user: userEvent.setup(), client, ...render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>) }
}

/** fetch mock answering by "METHOD path"; unmatched calls fail loudly. */
export function mockApi(routes: Record<string, (init: RequestInit | undefined, url: URL) => { status?: number; body?: unknown }>) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost')
    const key = `${init?.method ?? 'GET'} ${url.pathname}`
    const handler = routes[key] ?? routes[`${key}${url.search}`]
    if (!handler) throw new Error(`Unmocked request: ${key}${url.search}`)
    const { status = 200, body } = handler(init, url)
    return new Response(body === undefined ? null : JSON.stringify(body), { status })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}
