import { randomUUID } from 'node:crypto'
import { buildApp } from '../app.js'
import type { AppContext } from '../context.js'
import type { Db } from '../db/client.js'
import * as sessionModel from '../models/session.js'
import * as userModel from '../models/user.js'
import { fakeContext } from './context.js'

/** Fastify app with fake integrations; pass a real PGlite db for route tests that need data. */
export async function buildTestApp(overrides: Partial<AppContext> = {}) {
  const fakes = fakeContext(overrides)
  const app = await buildApp(fakes.ctx, { logger: false, forceCloseConnections: true })
  await app.ready()
  return { app, ...fakes }
}

export function sessionCookieFrom(setCookie: string | string[] | undefined): string {
  const header = Array.isArray(setCookie) ? setCookie.join(';') : (setCookie ?? '')
  const match = /v4_session=([^;]+)/.exec(header)
  if (!match) throw new Error('no session cookie')
  return `v4_session=${match[1]}`
}

/** Creates an active user straight in the db and returns its session cookie. */
export async function cookieFor(db: Db, input: { name: string; role: 'admin' | 'attendant' }) {
  const user = await userModel.create(db, {
    name: input.name,
    email: `${input.name.toLowerCase()}-${randomUUID()}@x.com`,
    passwordHash: 'unused',
    role: input.role,
    status: 'active',
  })
  return { user, cookie: `v4_session=${await sessionModel.create(db, user.id)}` }
}
