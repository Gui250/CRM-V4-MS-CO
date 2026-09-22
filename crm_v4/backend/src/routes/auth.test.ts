import { beforeEach, describe, expect, it } from 'vitest'
import type { App } from '../app.js'
import { createTestDb } from '../test/db.js'
import { buildTestApp, sessionCookieFrom } from '../test/app.js'

let app: App

beforeEach(async () => {
  ;({ app } = await buildTestApp({ db: await createTestDb() }))
})

const signup = (email: string) =>
  app.inject({ method: 'POST', url: '/api/auth/signup', payload: { name: 'Pessoa', email, password: 'senha-segura' } })

describe('auth routes', () => {
  it('signs up the first user as admin, sets an httpOnly cookie and serves /me', async () => {
    const response = await signup('ana@x.com')

    expect(response.statusCode).toBe(201)
    expect(response.json()).toMatchObject({ email: 'ana@x.com', role: 'admin', status: 'active' })
    expect(response.json()).not.toHaveProperty('passwordHash')
    expect(String(response.headers['set-cookie'])).toMatch(/HttpOnly/i)
    expect(String(response.headers['set-cookie'])).toMatch(/SameSite=Lax/i)

    const me = await app.inject({ url: '/api/auth/me', headers: { cookie: sessionCookieFrom(response.headers['set-cookie']) } })
    expect(me.json()).toMatchObject({ email: 'ana@x.com' })
  })

  it('creates later users as pending without a cookie; their login is refused', async () => {
    await signup('ana@x.com')
    const response = await signup('bia@x.com')

    expect(response.json()).toMatchObject({ role: 'attendant', status: 'pending' })
    expect(response.headers['set-cookie']).toBeUndefined()

    const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'bia@x.com', password: 'senha-segura' } })
    expect(login.statusCode).toBe(403)
    expect(login.json()).toMatchObject({ code: 'ACCOUNT_PENDING' })
  })

  it('returns 409 for a duplicated email and 422 for invalid input', async () => {
    await signup('ana@x.com')
    expect((await signup('ANA@x.com')).json()).toMatchObject({ code: 'EMAIL_TAKEN' })

    const invalid = await app.inject({ method: 'POST', url: '/api/auth/signup', payload: { name: 'A', email: 'x', password: '1' } })
    expect(invalid.statusCode).toBe(422)
    expect(invalid.json()).toMatchObject({ code: 'VALIDATION_ERROR' })
  })

  it('logs in, then logout clears the cookie and invalidates the session', async () => {
    await signup('ana@x.com')
    const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'ana@x.com', password: 'senha-segura' } })
    const cookie = sessionCookieFrom(login.headers['set-cookie'])

    const logout = await app.inject({ method: 'POST', url: '/api/auth/logout', headers: { cookie } })
    expect(logout.statusCode).toBe(204)
    expect(String(logout.headers['set-cookie'])).toMatch(/v4_session=;/)

    expect((await app.inject({ url: '/api/auth/me', headers: { cookie } })).statusCode).toBe(401)
  })

  it('returns 401 on /me without a cookie and INVALID_CREDENTIALS on a bad password', async () => {
    expect((await app.inject({ url: '/api/auth/me' })).json()).toMatchObject({ code: 'UNAUTHENTICATED' })

    await signup('ana@x.com')
    const bad = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'ana@x.com', password: 'errada-999' } })
    expect(bad.statusCode).toBe(401)
    expect(bad.json()).toMatchObject({ code: 'INVALID_CREDENTIALS' })
  })

  it('rate-limits repeated login attempts', async () => {
    const attempt = () => app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'x@x.com', password: 'y' } })
    for (let i = 0; i < 10; i++) await attempt()
    const blocked = await attempt()
    expect(blocked.statusCode).toBe(429)
    expect(blocked.json()).toMatchObject({ code: 'RATE_LIMITED' })
  })
})

describe('users routes', () => {
  it('lets the admin approve a pending user, and blocks non-admins', async () => {
    const adminCookie = sessionCookieFrom((await signup('ana@x.com')).headers['set-cookie'])
    const pending = (await signup('bia@x.com')).json()

    const list = await app.inject({ url: '/api/users?status=pending', headers: { cookie: adminCookie } })
    expect(list.json().map((u: { email: string }) => u.email)).toEqual(['bia@x.com'])

    const approve = await app.inject({
      method: 'PATCH',
      url: `/api/users/${pending.id}`,
      headers: { cookie: adminCookie },
      payload: { status: 'active' },
    })
    expect(approve.json()).toMatchObject({ status: 'active' })

    const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'bia@x.com', password: 'senha-segura' } })
    const attendantCookie = sessionCookieFrom(login.headers['set-cookie'])
    expect((await app.inject({ url: '/api/users', headers: { cookie: attendantCookie } })).statusCode).toBe(403)
  })
})
