import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as sessionModel from '../models/session.js'
import * as userModel from '../models/user.js'
import { fakeContext } from '../test/context.js'
import * as auth from './auth.js'

vi.mock('../models/user.js')
vi.mock('../models/session.js')

const user = (overrides: Partial<userModel.User> = {}): userModel.User => ({
  id: 'u1',
  name: 'Ana',
  email: 'ana@x.com',
  role: 'admin',
  status: 'active',
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  ...overrides,
})

const { ctx } = fakeContext()

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(sessionModel.create).mockResolvedValue('session-token')
})

describe('signup', () => {
  const input = { name: 'Ana', email: 'ana@x.com', password: 'senha-segura' }

  it('makes the first user an active admin and returns a session token', async () => {
    vi.mocked(userModel.countAll).mockResolvedValue(0)
    vi.mocked(userModel.create).mockResolvedValue(user())

    const result = await auth.signup(ctx, input)

    expect(userModel.create).toHaveBeenCalledWith(ctx.db, expect.objectContaining({ role: 'admin', status: 'active' }))
    expect(result.sessionToken).toBe('session-token')
  })

  it('makes later users pending attendants without a session', async () => {
    vi.mocked(userModel.countAll).mockResolvedValue(3)
    vi.mocked(userModel.create).mockResolvedValue(user({ role: 'attendant', status: 'pending' }))

    const result = await auth.signup(ctx, input)

    expect(userModel.create).toHaveBeenCalledWith(ctx.db, expect.objectContaining({ role: 'attendant', status: 'pending' }))
    expect(result.sessionToken).toBeNull()
    expect(sessionModel.create).not.toHaveBeenCalled()
  })

  it('stores an argon2id hash, never the plain password', async () => {
    vi.mocked(userModel.countAll).mockResolvedValue(0)
    vi.mocked(userModel.create).mockResolvedValue(user())

    await auth.signup(ctx, input)

    const stored = vi.mocked(userModel.create).mock.calls[0]![1].passwordHash
    expect(stored).toMatch(/^\$argon2id\$/)
    expect(stored).not.toContain(input.password)
  })
})

describe('login', () => {
  async function storedUser(status: userModel.User['status']) {
    const passwordHash = await auth.hashPassword('senha-segura')
    vi.mocked(userModel.findByEmailWithHash).mockResolvedValue({ ...user({ status }), passwordHash })
  }

  it('returns user and session for valid credentials', async () => {
    await storedUser('active')

    const result = await auth.login(ctx, { email: 'ana@x.com', password: 'senha-segura' })

    expect(result).toMatchObject({ user: { id: 'u1' }, sessionToken: 'session-token' })
    expect(result.user).not.toHaveProperty('passwordHash')
  })

  it('uses the same INVALID_CREDENTIALS error for unknown email and wrong password', async () => {
    vi.mocked(userModel.findByEmailWithHash).mockResolvedValue(null)
    const unknownEmail = auth.login(ctx, { email: 'x@x.com', password: 'senha-segura' })
    await expect(unknownEmail).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS', httpStatus: 401 })

    await storedUser('active')
    const wrongPassword = auth.login(ctx, { email: 'ana@x.com', password: 'errada-123' })
    await expect(wrongPassword).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS', httpStatus: 401 })
  })

  it('rejects pending and disabled accounts with specific codes', async () => {
    await storedUser('pending')
    await expect(auth.login(ctx, { email: 'ana@x.com', password: 'senha-segura' })).rejects.toMatchObject({
      code: 'ACCOUNT_PENDING',
      httpStatus: 403,
    })

    await storedUser('disabled')
    await expect(auth.login(ctx, { email: 'ana@x.com', password: 'senha-segura' })).rejects.toMatchObject({
      code: 'ACCOUNT_DISABLED',
      httpStatus: 403,
    })
  })
})

describe('logout', () => {
  it('deletes the session', async () => {
    await auth.logout(ctx, 'token')
    expect(sessionModel.deleteByToken).toHaveBeenCalledWith(ctx.db, 'token')
  })
})
