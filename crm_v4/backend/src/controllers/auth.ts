import { hash, verify } from '@node-rs/argon2'
import type { AppContext } from '../context.js'
import { DomainError, unauthorized } from '../lib/errors.js'
import * as sessionModel from '../models/session.js'
import * as userModel from '../models/user.js'

// Algorithm 2 = argon2id.
const ARGON2ID = 2

export const hashPassword = (password: string) => hash(password, { algorithm: ARGON2ID })

// Verified when the email does not exist, so both failure paths take similar time.
let dummyHash: Promise<string> | undefined
const getDummyHash = () => (dummyHash ??= hashPassword('dummy-password-for-timing'))

const invalidCredentials = () => unauthorized('INVALID_CREDENTIALS', 'E-mail ou senha incorretos.')

export async function signup(
  ctx: AppContext,
  input: { name: string; email: string; password: string },
): Promise<{ user: userModel.User; sessionToken: string | null }> {
  const isFirstUser = (await userModel.countAll(ctx.db)) === 0
  const user = await userModel.create(ctx.db, {
    name: input.name.trim(),
    email: input.email,
    passwordHash: await hashPassword(input.password),
    role: isFirstUser ? 'admin' : 'attendant',
    status: isFirstUser ? 'active' : 'pending',
  })
  const sessionToken = isFirstUser ? await sessionModel.create(ctx.db, user.id) : null
  return { user, sessionToken }
}

export async function login(
  ctx: AppContext,
  input: { email: string; password: string },
): Promise<{ user: userModel.User; sessionToken: string }> {
  const found = await userModel.findByEmailWithHash(ctx.db, input.email)
  if (!found) {
    await verify(await getDummyHash(), input.password)
    throw invalidCredentials()
  }
  if (!(await verify(found.passwordHash, input.password))) throw invalidCredentials()

  if (found.status === 'pending') {
    throw new DomainError('ACCOUNT_PENDING', 'Sua conta aguarda aprovação de um administrador.', 403)
  }
  if (found.status === 'disabled') {
    throw new DomainError('ACCOUNT_DISABLED', 'Sua conta está desativada. Fale com um administrador.', 403)
  }

  const { passwordHash, ...user } = found
  return { user, sessionToken: await sessionModel.create(ctx.db, user.id) }
}

export async function logout(ctx: AppContext, token: string): Promise<void> {
  await sessionModel.deleteByToken(ctx.db, token)
}
