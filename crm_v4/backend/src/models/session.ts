import { createHash, randomBytes } from 'node:crypto'
import { and, eq, gt } from 'drizzle-orm'
import type { Db } from '../db/client.js'
import { sessions, users } from '../db/schema.js'
import type { User } from './user.js'

const DAY_MS = 24 * 60 * 60 * 1000
export const SESSION_TTL_MS = 7 * DAY_MS
const RENEW_WHEN_REMAINING_MS = DAY_MS
const TOKEN_BYTES = 32

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')
const newExpiry = () => new Date(Date.now() + SESSION_TTL_MS)

/** Returns the raw token for the cookie; only its hash is stored. */
export async function create(db: Db, userId: string): Promise<string> {
  const token = randomBytes(TOKEN_BYTES).toString('base64url')
  await db.insert(sessions).values({ userId, tokenHash: hashToken(token), expiresAt: newExpiry() })
  return token
}

export async function findValid(db: Db, token: string): Promise<User | null> {
  const tokenHash = hashToken(token)
  const [row] = await db
    .select({
      sessionId: sessions.id,
      expiresAt: sessions.expiresAt,
      user: {
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        status: users.status,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      },
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, new Date()), eq(users.status, 'active')))
  if (!row) return null

  if (row.expiresAt.getTime() - Date.now() < RENEW_WHEN_REMAINING_MS) {
    await db.update(sessions).set({ expiresAt: newExpiry() }).where(eq(sessions.id, row.sessionId))
  }
  return row.user
}

export async function deleteByToken(db: Db, token: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)))
}

export async function deleteAllForUser(db: Db, userId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.userId, userId))
}
