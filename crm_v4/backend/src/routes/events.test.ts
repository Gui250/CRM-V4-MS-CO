import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { App } from '../app.js'
import type { Db } from '../db/client.js'
import { sessions } from '../db/schema.js'
import { createEventBus } from '../realtime/bus.js'
import { buildTestApp, sessionCookieFrom } from '../test/app.js'
import { createTestDb } from '../test/db.js'
import { PING_INTERVAL_MS } from './events.js'

let app: App
let db: Db
const bus = createEventBus()

beforeEach(async () => {
  db = await createTestDb()
  ;({ app } = await buildTestApp({ db, bus }))
})
afterEach(async () => {
  vi.useRealTimers()
  await app.close()
})

async function openStream() {
  const signup = await app.inject({ method: 'POST', url: '/api/auth/signup', payload: { name: 'Ana', email: 'a@x.com', password: 'senha-segura' } })
  const address = await app.listen({ port: 0, host: '127.0.0.1' })
  const response = await fetch(`${address}/api/events`, { headers: { cookie: sessionCookieFrom(signup.headers['set-cookie']) } })
  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  const read = async () => {
    const { value, done } = await reader.read()
    return done ? null : decoder.decode(value)
  }
  return { response, read }
}

describe('GET /api/events', () => {
  it('requires a session', async () => {
    expect((await app.inject({ url: '/api/events' })).statusCode).toBe(401)
  })

  it('streams bus events as SSE', async () => {
    const { response, read } = await openStream()
    expect(response.headers.get('content-type')).toBe('text/event-stream')
    expect(await read()).toContain(': connected')

    bus.publish({ type: 'connection.updated', data: { connection: { status: 'connected', phoneNumber: '55', qrCode: null, lastConnectedAt: null } } })

    const chunk = await read()
    expect(chunk).toContain('event: connection.updated')
    expect(chunk).toContain('"status":"connected"')
  })

  it('closes the stream on the next ping once the session is no longer valid', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    const { read } = await openStream()
    await read()

    await db.delete(sessions)
    await vi.advanceTimersByTimeAsync(PING_INTERVAL_MS)

    expect(await read()).toBeNull()
  })
})
