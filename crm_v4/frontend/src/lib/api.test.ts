import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, apiFetch } from './api'

const fetchMock = vi.fn<typeof fetch>()
const assign = vi.fn()

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  vi.stubGlobal('location', { pathname: '/chat', assign })
})
afterEach(() => {
  vi.unstubAllGlobals()
  fetchMock.mockReset()
  assign.mockReset()
})

const respond = (status: number, body?: unknown) =>
  fetchMock.mockResolvedValueOnce(new Response(body === undefined ? null : JSON.stringify(body), { status }))

describe('apiFetch', () => {
  it('sends JSON with credentials and parses the response', async () => {
    respond(200, { ok: true })

    expect(await apiFetch('/api/x', { method: 'POST', json: { a: 1 } })).toEqual({ ok: true })
    const [, init] = fetchMock.mock.calls[0]!
    expect(init).toMatchObject({ credentials: 'include', body: '{"a":1}', headers: { 'Content-Type': 'application/json' } })
  })

  it('returns undefined for 204', async () => {
    respond(204)
    expect(await apiFetch('/api/x')).toBeUndefined()
  })

  it('throws ApiError with code and message from the error body', async () => {
    respond(409, { code: 'EMAIL_TAKEN', message: 'E-mail já cadastrado.' })

    const error = await apiFetch('/api/x').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 409, code: 'EMAIL_TAKEN', message: 'E-mail já cadastrado.' })
  })

  it('keeps the details of the error body', async () => {
    respond(409, { code: 'REPORT_CONFLICT', message: 'Conflito.', details: { version: 3 } })

    expect(await apiFetch('/api/x').catch((e: unknown) => e)).toMatchObject({ details: { version: 3 } })
  })

  it('redirects to /login only when the session is missing', async () => {
    respond(401, { code: 'INVALID_CREDENTIALS', message: 'x' })
    await apiFetch('/api/auth/login').catch(() => undefined)
    expect(assign).not.toHaveBeenCalled()

    respond(401, { code: 'UNAUTHENTICATED', message: 'x' })
    await apiFetch('/api/auth/me').catch(() => undefined)
    expect(assign).toHaveBeenCalledWith('/login')
  })

  it('falls back to a generic message when the body is not JSON', async () => {
    fetchMock.mockResolvedValueOnce(new Response('oops', { status: 502 }))
    await expect(apiFetch('/api/x')).rejects.toMatchObject({ status: 502, code: 'UNKNOWN' })
  })
})
