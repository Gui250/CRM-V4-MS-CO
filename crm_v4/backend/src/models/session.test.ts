import { createHash } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Db } from '../db/client.js'
import { sessions } from '../db/schema.js'
import { createTestDb } from '../test/db.js'
import * as sessionModel from './session.js'
import * as userModel from './user.js'

const DAY = 24 * 60 * 60 * 1000
let db: Db
let userId: string

beforeEach(async () => {
  db = await createTestDb()
  const user = await userModel.create(db, { name: 'Ana', email: 'a@x.com', passwordHash: 'h', role: 'admin', status: 'active' })
  userId = user.id
})

describe('session model', () => {
  it('stores only the SHA-256 of the token, expiring in 7 days', async () => {
    const token = await sessionModel.create(db, userId)
    const [row] = await db.select().from(sessions)

    expect(row!.tokenHash).toBe(createHash('sha256').update(token).digest('hex'))
    expect(row!.tokenHash).not.toBe(token)
    expect(row!.expiresAt.getTime() - Date.now()).toBeGreaterThan(7 * DAY - 60_000)
  })

  it('finds the user of a valid session', async () => {
    const token = await sessionModel.create(db, userId)

    expect(await sessionModel.findValid(db, token)).toMatchObject({ id: userId, role: 'admin' })
    expect(await sessionModel.findValid(db, 'token-inexistente')).toBeNull()
  })

  it('rejects expired sessions and users that are not active', async () => {
    const token = await sessionModel.create(db, userId)
    await db.update(sessions).set({ expiresAt: new Date(Date.now() - 1000) })
    expect(await sessionModel.findValid(db, token)).toBeNull()

    const other = await sessionModel.create(db, userId)
    await userModel.update(db, userId, { status: 'disabled' })
    expect(await sessionModel.findValid(db, other)).toBeNull()
  })

  it('renews expiry to 7 days when less than 1 day remains', async () => {
    const token = await sessionModel.create(db, userId)
    const soon = new Date(Date.now() + DAY / 2)
    await db.update(sessions).set({ expiresAt: soon })

    await sessionModel.findValid(db, token)

    const [row] = await db.select().from(sessions)
    expect(row!.expiresAt.getTime()).toBeGreaterThan(Date.now() + 6 * DAY)
  })

  it('does not renew when more than 1 day remains', async () => {
    const token = await sessionModel.create(db, userId)
    const later = new Date(Date.now() + 3 * DAY)
    await db.update(sessions).set({ expiresAt: later })

    await sessionModel.findValid(db, token)

    const [row] = await db.select().from(sessions)
    expect(row!.expiresAt.getTime()).toBe(later.getTime())
  })

  it('deletes one session by token, or all sessions of a user', async () => {
    const first = await sessionModel.create(db, userId)
    await sessionModel.create(db, userId)

    await sessionModel.deleteByToken(db, first)
    expect(await sessionModel.findValid(db, first)).toBeNull()
    expect(await db.select().from(sessions).where(eq(sessions.userId, userId))).toHaveLength(1)

    await sessionModel.deleteAllForUser(db, userId)
    expect(await db.select().from(sessions)).toHaveLength(0)
  })
})
