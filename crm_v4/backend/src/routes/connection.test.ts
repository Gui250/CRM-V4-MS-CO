import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { App } from '../app.js'
import * as connection from '../controllers/connection.js'
import { buildTestApp, sessionCookieFrom } from '../test/app.js'
import { createTestDb } from '../test/db.js'

vi.mock('../controllers/connection.js')

let app: App
beforeEach(async () => {
  vi.resetAllMocks()
  vi.mocked(connection.getStatus).mockResolvedValue({ status: 'disconnected', phoneNumber: null, qrCode: null, lastConnectedAt: null })
  vi.mocked(connection.connect).mockResolvedValue({ status: 'awaiting_qr', phoneNumber: null, qrCode: 'QR', lastConnectedAt: null })
  ;({ app } = await buildTestApp({ db: await createTestDb() }))
})

async function cookieFor(email: string, approveWith?: string) {
  const signup = await app.inject({ method: 'POST', url: '/api/auth/signup', payload: { name: 'Pessoa', email, password: 'senha-segura' } })
  if (!approveWith) return sessionCookieFrom(signup.headers['set-cookie'])
  await app.inject({ method: 'PATCH', url: `/api/users/${signup.json().id}`, headers: { cookie: approveWith }, payload: { status: 'active' } })
  const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email, password: 'senha-segura' } })
  return sessionCookieFrom(login.headers['set-cookie'])
}

describe('connection routes', () => {
  it('lets any logged-in user read the status, but only admins connect', async () => {
    const admin = await cookieFor('admin@x.com')
    const attendant = await cookieFor('att@x.com', admin)

    expect((await app.inject({ url: '/api/connection', headers: { cookie: attendant } })).json()).toMatchObject({ status: 'disconnected' })
    expect((await app.inject({ method: 'POST', url: '/api/connection/connect', headers: { cookie: attendant } })).statusCode).toBe(403)
    expect((await app.inject({ method: 'POST', url: '/api/connection/connect', headers: { cookie: admin } })).json()).toMatchObject({ qrCode: 'QR' })
    expect((await app.inject({ url: '/api/connection' })).statusCode).toBe(401)
  })
})
