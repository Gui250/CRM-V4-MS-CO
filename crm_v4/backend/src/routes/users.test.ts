import { beforeEach, describe, expect, it } from 'vitest'
import type { App } from '../app.js'
import type { Db } from '../db/client.js'
import * as userModel from '../models/user.js'
import { buildTestApp, cookieFor } from '../test/app.js'
import { createTestDb } from '../test/db.js'

let app: App
let db: Db

beforeEach(async () => {
  db = await createTestDb()
  app = (await buildTestApp({ db })).app
})

describe('GET /api/users/assignable', () => {
  it('lists active users for any logged-in user', async () => {
    const { cookie } = await cookieFor(db, { name: 'Bia', role: 'attendant' })
    await userModel.create(db, { name: 'Pendente', email: 'p@x.com', passwordHash: 'h', role: 'attendant', status: 'pending' })

    const response = await app.inject({ url: '/api/users/assignable', headers: { cookie } })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual([{ id: expect.any(String), name: 'Bia' }])
  })

  it('requires a session', async () => {
    expect((await app.inject({ url: '/api/users/assignable' })).statusCode).toBe(401)
  })
})
