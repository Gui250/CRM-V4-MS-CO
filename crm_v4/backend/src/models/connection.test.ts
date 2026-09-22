import { beforeEach, describe, expect, it } from 'vitest'
import type { Db } from '../db/client.js'
import { whatsappConnection } from '../db/schema.js'
import { createTestDb } from '../test/db.js'
import * as connectionModel from './connection.js'

let db: Db
beforeEach(async () => {
  db = await createTestDb()
})

describe('connection model', () => {
  it('creates the singleton row as disconnected on first read, and reuses it', async () => {
    const first = await connectionModel.get(db, 'v4-msco')
    const second = await connectionModel.get(db, 'v4-msco')

    expect(first).toMatchObject({ status: 'disconnected', instanceName: 'v4-msco', lastQr: null })
    expect(second.id).toBe(first.id)
  })

  it('refuses a second row', async () => {
    await connectionModel.get(db, 'v4-msco')
    await expect(db.insert(whatsappConnection).values({ instanceName: 'outra' })).rejects.toThrow()
  })

  it('updates status, QR, phone and last connection date', async () => {
    await connectionModel.get(db, 'v4-msco')
    const now = new Date()

    const updated = await connectionModel.update(db, 'v4-msco', {
      status: 'connected',
      lastQr: null,
      phoneNumber: '5511999999999',
      lastConnectedAt: now,
    })

    expect(updated).toMatchObject({ status: 'connected', phoneNumber: '5511999999999' })
    expect(updated.lastConnectedAt?.getTime()).toBe(now.getTime())
  })
})
