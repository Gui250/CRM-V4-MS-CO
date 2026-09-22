import { describe, expect, it, vi } from 'vitest'
import { MAX_API_PAGE_BYTES, MAX_API_PAGES } from '../../models/bi/limits.js'
import { readApi, type ApiConfig } from './http-api.js'

async function collect<T>(rows: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = []
  for await (const row of rows) out.push(row)
  return out
}

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), { ...init, headers: { 'content-type': 'application/json' } })

const base: ApiConfig = { url: 'https://api.example.com/v1/leads', method: 'GET', headers: [], query: [] }

function run(config: Partial<ApiConfig>, fetchFake: typeof fetch, secrets = {}) {
  return collect(readApi({ ...base, ...config }, secrets, { allowPrivate: true, fetch: fetchFake }))
}

const lastRequest = (fetchFake: ReturnType<typeof vi.fn>) => {
  const [url, init] = fetchFake.mock.lastCall as [URL, RequestInit]
  return { url, init, headers: new Headers(init.headers) }
}

describe('readApi request', () => {
  it('sends GET with query params, Accept JSON, plain and secret headers', async () => {
    const fetchFake = vi.fn(async () => json([]))

    await run(
      { query: [{ name: 'status', value: 'ativo' }], headers: [{ name: 'X-Conta', value: '7' }] },
      fetchFake,
      { headers: [{ name: 'Authorization', value: 'Bearer t' }] },
    )

    const { url, init, headers } = lastRequest(fetchFake)
    expect(url.toString()).toBe('https://api.example.com/v1/leads?status=ativo')
    expect(init.method).toBe('GET')
    expect(headers.get('accept')).toBe('application/json')
    expect(headers.get('x-conta')).toBe('7')
    expect(headers.get('authorization')).toBe('Bearer t')
  })

  it('sends POST with the JSON body', async () => {
    const fetchFake = vi.fn(async () => json([]))

    await run({ method: 'POST', body: '{"q":1}' }, fetchFake)

    const { init, headers } = lastRequest(fetchFake)
    expect(init.method).toBe('POST')
    expect(init.body).toBe('{"q":1}')
    expect(headers.get('content-type')).toBe('application/json')
  })

  it('passes a timeout signal', async () => {
    const fetchFake = vi.fn(async () => json([]))

    await run({}, fetchFake)

    expect(lastRequest(fetchFake).init.signal).toBeInstanceOf(AbortSignal)
  })
})

describe('readApi items', () => {
  it('reads the list at itemsPath', async () => {
    const fetchFake = vi.fn(async () => json({ data: { items: [{ id: 1 }, { id: 2 }] } }))

    expect(await run({ itemsPath: 'data.items' }, fetchFake)).toEqual([{ id: 1 }, { id: 2 }])
  })

  it('rejects a missing itemsPath', async () => {
    const fetchFake = vi.fn(async () => json({ data: {} }))

    await expect(run({ itemsPath: 'data.items' }, fetchFake)).rejects.toMatchObject({
      code: 'ITEMS_PATH_NOT_FOUND',
      httpStatus: 422,
      message: 'Não encontrei a lista de itens em "data.items".',
    })
  })

  it('uses a top-level array', async () => {
    const fetchFake = vi.fn(async () => json([{ id: 1 }]))

    expect(await run({}, fetchFake)).toEqual([{ id: 1 }])
  })

  it('uses the first array property of an object', async () => {
    const fetchFake = vi.fn(async () => json({ total: 1, results: [{ id: 1 }] }))

    expect(await run({}, fetchFake)).toEqual([{ id: 1 }])
  })

  it('treats an object without arrays as one row', async () => {
    const fetchFake = vi.fn(async () => json({ total: 3 }))

    expect(await run({}, fetchFake)).toEqual([{ total: 3 }])
  })

  it('flattens nested objects with dots and stringifies arrays', async () => {
    const fetchFake = vi.fn(async () => json([{ id: 1, cliente: { nome: 'Ana', end: { uf: 'SP' } }, tags: ['a', 'b'] }]))

    expect(await run({}, fetchFake)).toEqual([{ id: 1, 'cliente.nome': 'Ana', 'cliente.end.uf': 'SP', tags: '["a","b"]' }])
  })
})

describe('readApi pagination', () => {
  const pageOf = (url: URL | RequestInfo) => Number(new URL(String(url)).searchParams.get('page'))

  it('requests pages from start and stops on an empty page', async () => {
    const fetchFake = vi.fn(async (url: URL | RequestInfo) => json(pageOf(url) <= 2 ? [{ page: pageOf(url) }] : []))

    const rows = await run({ pagination: { param: 'page', start: 1, maxPages: 10 } }, fetchFake)

    expect(rows).toEqual([{ page: 1 }, { page: 2 }])
    expect(fetchFake).toHaveBeenCalledTimes(3)
  })

  it('stops after maxPages', async () => {
    const fetchFake = vi.fn(async (url: URL | RequestInfo) => json([{ page: pageOf(url) }]))

    await run({ pagination: { param: 'page', start: 0, maxPages: 3 } }, fetchFake)

    expect(fetchFake).toHaveBeenCalledTimes(3)
  })

  it(`never requests more than ${MAX_API_PAGES} pages`, async () => {
    const fetchFake = vi.fn(async (url: URL | RequestInfo) => json([{ page: pageOf(url) }]))

    await run({ pagination: { param: 'page', start: 0, maxPages: 500 } }, fetchFake)

    expect(fetchFake).toHaveBeenCalledTimes(MAX_API_PAGES)
  })
})

describe('readApi errors', () => {
  it.each([401, 403])('maps HTTP %i to AUTH_FAILED', async (status) => {
    const fetchFake = vi.fn(async () => json({}, { status }))

    await expect(run({}, fetchFake)).rejects.toMatchObject({ code: 'AUTH_FAILED', httpStatus: 422 })
  })

  it('maps other HTTP errors to CONNECTION_FAILED with the status', async () => {
    const fetchFake = vi.fn(async () => json({}, { status: 503 }))

    await expect(run({}, fetchFake)).rejects.toMatchObject({ code: 'CONNECTION_FAILED', message: expect.stringContaining('HTTP 503') })
  })

  it('maps a non-JSON body to CONNECTION_FAILED', async () => {
    const fetchFake = vi.fn(async () => new Response('<html>'))

    await expect(run({}, fetchFake)).rejects.toMatchObject({ code: 'CONNECTION_FAILED', message: 'A API não respondeu em JSON.' })
  })

  it('maps a timeout to TIMEOUT', async () => {
    const fetchFake = vi.fn(async () => {
      throw new DOMException('The operation was aborted due to timeout', 'TimeoutError')
    })

    await expect(run({}, fetchFake)).rejects.toMatchObject({ code: 'TIMEOUT', httpStatus: 422 })
  })

  it('maps a network failure to CONNECTION_FAILED', async () => {
    const fetchFake = vi.fn(async () => {
      throw new TypeError('fetch failed')
    })

    await expect(run({}, fetchFake)).rejects.toMatchObject({ code: 'CONNECTION_FAILED' })
  })

  it('rejects a declared Content-Length over 20 MB', async () => {
    const fetchFake = vi.fn(async () => new Response('[]', { headers: { 'content-length': String(MAX_API_PAGE_BYTES + 1) } }))

    await expect(run({}, fetchFake)).rejects.toMatchObject({ code: 'TOO_LARGE', message: 'A resposta da API passou de 20 MB.' })
  })

  it('aborts a streamed body once it passes 20 MB', async () => {
    const chunk = new Uint8Array(1024 * 1024)
    let cancelled = false
    const body = new ReadableStream<Uint8Array>({
      pull: (controller) => controller.enqueue(chunk),
      cancel: () => {
        cancelled = true
      },
    })
    const fetchFake = vi.fn(async () => new Response(body))

    await expect(run({}, fetchFake)).rejects.toMatchObject({ code: 'TOO_LARGE' })
    expect(cancelled).toBe(true)
  })
})
