import { beforeEach, describe, expect, it } from 'vitest'
import type { Db } from '../db/client.js'
import { createTestDb } from '../test/db.js'
import * as userModel from './user.js'

let db: Db

const base = { name: 'Ana Souza', email: 'Ana@Exemplo.com', passwordHash: 'hash', role: 'admin', status: 'active' } as const

beforeEach(async () => {
  db = await createTestDb()
})

describe('user model', () => {
  it('creates a user with lowercased email and never exposes the hash', async () => {
    const user = await userModel.create(db, base)

    expect(user.email).toBe('ana@exemplo.com')
    expect(user).not.toHaveProperty('passwordHash')
  })

  it('finds by email case-insensitively, with hash only from findByEmailWithHash', async () => {
    await userModel.create(db, base)

    expect(await userModel.findByEmailWithHash(db, 'ANA@exemplo.com')).toMatchObject({ passwordHash: 'hash' })
    expect(await userModel.findByEmailWithHash(db, 'outra@exemplo.com')).toBeNull()
  })

  it('rejects a duplicated email with EMAIL_TAKEN', async () => {
    await userModel.create(db, base)

    await expect(userModel.create(db, { ...base, email: 'ana@exemplo.com' })).rejects.toMatchObject({
      code: 'EMAIL_TAKEN',
      httpStatus: 409,
    })
  })

  it('counts, lists by status, updates and counts active admins', async () => {
    const admin = await userModel.create(db, base)
    const pending = await userModel.create(db, { ...base, email: 'b@x.com', role: 'attendant', status: 'pending' })

    expect(await userModel.countAll(db)).toBe(2)
    expect((await userModel.list(db, { status: 'pending' })).map((u) => u.id)).toEqual([pending.id])
    expect(await userModel.list(db, {})).toHaveLength(2)
    expect(await userModel.countActiveAdmins(db)).toBe(1)

    const updated = await userModel.update(db, admin.id, { status: 'disabled' })
    expect(updated?.status).toBe('disabled')
    expect(await userModel.countActiveAdmins(db)).toBe(0)
    expect(await userModel.findById(db, pending.id)).toMatchObject({ email: 'b@x.com' })
  })

  it('returns null when updating or finding a missing user', async () => {
    const missing = '00000000-0000-0000-0000-000000000000'
    expect(await userModel.update(db, missing, { status: 'active' })).toBeNull()
    expect(await userModel.findById(db, missing)).toBeNull()
  })

  it('lists active users by name for the assignee picker', async () => {
    const base = { passwordHash: 'h', role: 'attendant' as const }
    await userModel.create(db, { ...base, name: 'Zé', email: 'z@x.com', status: 'active' })
    await userModel.create(db, { ...base, name: 'Ana', email: 'a@x.com', status: 'active' })
    await userModel.create(db, { ...base, name: 'Pendente', email: 'p@x.com', status: 'pending' })

    const active = await userModel.listActive(db)
    expect(active.map((user) => user.name)).toEqual(['Ana', 'Zé'])
    expect(Object.keys(active[0]!)).toEqual(['id', 'name'])
  })
})
