import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as sessionModel from '../models/session.js'
import * as userModel from '../models/user.js'
import { fakeContext } from '../test/context.js'
import * as users from './users.js'

vi.mock('../models/user.js')
vi.mock('../models/session.js')

const make = (overrides: Partial<userModel.User>): userModel.User => ({
  id: 'u',
  name: 'N',
  email: 'n@x.com',
  role: 'attendant',
  status: 'active',
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
})

const admin = make({ id: 'admin', role: 'admin' })
const attendant = make({ id: 'att', role: 'attendant' })
const { ctx } = fakeContext()

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(userModel.update).mockImplementation(async (_db, id, changes) => make({ id, ...changes }))
  vi.mocked(userModel.countActiveAdmins).mockResolvedValue(2)
})

describe('users controller', () => {
  it('only lets admins list and change users', async () => {
    await expect(users.list(ctx, attendant, {})).rejects.toMatchObject({ httpStatus: 403 })
    await expect(users.update(ctx, attendant, 'x', { status: 'active' })).rejects.toMatchObject({ httpStatus: 403 })
  })

  it('lists users filtered by status', async () => {
    vi.mocked(userModel.list).mockResolvedValue([attendant])
    expect(await users.list(ctx, admin, { status: 'pending' })).toEqual([attendant])
    expect(userModel.list).toHaveBeenCalledWith(ctx.db, { status: 'pending' })
  })

  it('approves a pending user', async () => {
    vi.mocked(userModel.findById).mockResolvedValue(make({ id: 'p', status: 'pending' }))
    const result = await users.update(ctx, admin, 'p', { status: 'active' })
    expect(result.status).toBe('active')
  })

  it('disabling a user also deletes their sessions', async () => {
    vi.mocked(userModel.findById).mockResolvedValue(attendant)
    await users.update(ctx, admin, 'att', { status: 'disabled' })
    expect(sessionModel.deleteAllForUser).toHaveBeenCalledWith(ctx.db, 'att')
  })

  it('reactivates a disabled user without touching sessions', async () => {
    vi.mocked(userModel.findById).mockResolvedValue(make({ id: 'd', status: 'disabled' }))
    await users.update(ctx, admin, 'd', { status: 'active' })
    expect(sessionModel.deleteAllForUser).not.toHaveBeenCalled()
  })

  it('does not let an admin disable themselves', async () => {
    vi.mocked(userModel.findById).mockResolvedValue(admin)
    await expect(users.update(ctx, admin, 'admin', { status: 'disabled' })).rejects.toMatchObject({ httpStatus: 409 })
  })

  it('blocks disabling or demoting the last active admin', async () => {
    const otherAdmin = make({ id: 'admin2', role: 'admin' })
    vi.mocked(userModel.findById).mockResolvedValue(otherAdmin)
    vi.mocked(userModel.countActiveAdmins).mockResolvedValue(1)

    await expect(users.update(ctx, admin, 'admin2', { status: 'disabled' })).rejects.toMatchObject({ code: 'LAST_ADMIN' })
    await expect(users.update(ctx, admin, 'admin2', { role: 'attendant' })).rejects.toMatchObject({ code: 'LAST_ADMIN' })
  })

  it('returns 404 for unknown users', async () => {
    vi.mocked(userModel.findById).mockResolvedValue(null)
    await expect(users.update(ctx, admin, 'nope', { status: 'active' })).rejects.toMatchObject({ httpStatus: 404 })
  })
})
