import { describe, expect, it, vi } from 'vitest'
import { assertHostAllowed, guardedFetch, type Lookup } from './network-guard.js'

const resolvesTo = (...addresses: string[]): Lookup =>
  vi.fn(async () => addresses.map((address) => ({ address, family: address.includes(':') ? 6 : 4 })))

const publicDns = resolvesTo('93.184.216.34')

describe('assertHostAllowed', () => {
  it.each([
    '127.0.0.1',
    '10.1.2.3',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.0.10',
    '169.254.169.254',
    '100.64.0.1',
    '0.0.0.0',
    '::1',
    '::',
    'fc00::1',
    'fd12:3456::1',
    'fe80::1',
    '::ffff:127.0.0.1',
    '[::1]',
  ])('rejects %s', async (host) => {
    await expect(assertHostAllowed(host, { allowPrivate: false })).rejects.toMatchObject({
      code: 'HOST_NOT_ALLOWED',
      httpStatus: 422,
      message: 'Endereço não permitido: aponta para uma rede interna.',
    })
  })

  it('rejects a hostname when any resolved address is internal', async () => {
    const lookup = resolvesTo('93.184.216.34', '10.0.0.5')

    await expect(assertHostAllowed('db.example.com', { allowPrivate: false, lookup })).rejects.toMatchObject({
      code: 'HOST_NOT_ALLOWED',
    })
  })

  it('resolves hostnames with all address families', async () => {
    const lookup = resolvesTo('93.184.216.34')

    await assertHostAllowed('example.com', { allowPrivate: false, lookup })

    expect(lookup).toHaveBeenCalledWith('example.com', { all: true })
  })

  it('accepts public addresses', async () => {
    await expect(assertHostAllowed('8.8.8.8', { allowPrivate: false })).resolves.toBeUndefined()
  })

  it('accepts 172.32.0.1, just outside 172.16/12', async () => {
    await expect(assertHostAllowed('172.32.0.1', { allowPrivate: false })).resolves.toBeUndefined()
  })

  it('allows internal hosts when allowPrivate is on', async () => {
    await expect(assertHostAllowed('127.0.0.1', { allowPrivate: true })).resolves.toBeUndefined()
  })

  it('maps a failed lookup to CONNECTION_FAILED', async () => {
    const lookup: Lookup = vi.fn(async () => {
      throw Object.assign(new Error('nope'), { code: 'ENOTFOUND' })
    })

    await expect(assertHostAllowed('nope.invalid', { allowPrivate: false, lookup })).rejects.toMatchObject({
      code: 'CONNECTION_FAILED',
    })
  })
})

const redirect = (location: string, status = 302) => new Response(null, { status, headers: { location } })

describe('guardedFetch', () => {
  it('returns the response of a public URL, fetched with redirect manual', async () => {
    const fetchFake = vi.fn(async () => new Response('ok'))

    const response = await guardedFetch('https://example.com/a', {}, { allowPrivate: false, lookup: publicDns, fetch: fetchFake })

    expect(await response.text()).toBe('ok')
    expect(fetchFake).toHaveBeenCalledWith(new URL('https://example.com/a'), { redirect: 'manual' })
  })

  it('rejects non-http protocols', async () => {
    await expect(guardedFetch('file:///etc/passwd', {}, { allowPrivate: true })).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    })
  })

  it('follows up to 5 redirects', async () => {
    const fetchFake = vi.fn(async (url: URL | RequestInfo) => {
      const hop = Number(new URL(String(url)).searchParams.get('hop'))
      return hop < 5 ? redirect(`/next?hop=${hop + 1}`) : new Response('done')
    })

    const response = await guardedFetch('https://example.com/?hop=0', {}, { allowPrivate: false, lookup: publicDns, fetch: fetchFake })

    expect(await response.text()).toBe('done')
    expect(fetchFake).toHaveBeenCalledTimes(6)
  })

  it('rejects the 6th redirect', async () => {
    const fetchFake = vi.fn(async () => redirect('/again'))

    await expect(
      guardedFetch('https://example.com/', {}, { allowPrivate: false, lookup: publicDns, fetch: fetchFake }),
    ).rejects.toMatchObject({ code: 'CONNECTION_FAILED', httpStatus: 422 })
    expect(fetchFake).toHaveBeenCalledTimes(6)
  })

  it('rejects a redirect to an internal host', async () => {
    const fetchFake = vi.fn(async () => redirect('http://169.254.169.254/latest/meta-data'))

    await expect(
      guardedFetch('https://example.com/', {}, { allowPrivate: false, lookup: publicDns, fetch: fetchFake }),
    ).rejects.toMatchObject({ code: 'HOST_NOT_ALLOWED' })
    expect(fetchFake).toHaveBeenCalledTimes(1)
  })

  it('drops headers when a redirect leaves the origin', async () => {
    const fetchFake = vi.fn(async (url: URL | RequestInfo) =>
      String(url).startsWith('https://a.com') ? redirect('https://b.com/') : new Response('ok'),
    )

    await guardedFetch('https://a.com/', { headers: { Authorization: 'Bearer x' } }, { allowPrivate: true, fetch: fetchFake })

    expect(fetchFake).toHaveBeenLastCalledWith(new URL('https://b.com/'), { headers: undefined, redirect: 'manual' })
  })

  it('switches to GET without body on a 303', async () => {
    const fetchFake = vi.fn(async (url: URL | RequestInfo) =>
      String(url).endsWith('/post') ? redirect('/result', 303) : new Response('ok'),
    )

    await guardedFetch('https://a.com/post', { method: 'POST', body: '{}' }, { allowPrivate: true, fetch: fetchFake })

    expect(fetchFake).toHaveBeenLastCalledWith(new URL('https://a.com/result'), {
      method: 'GET',
      body: undefined,
      redirect: 'manual',
    })
  })
})
