import { and, asc, count, eq, type SQL } from 'drizzle-orm'
import type { Db } from '../db/client.js'
import { users, type UserRow } from '../db/schema.js'
import { isUniqueViolation } from '../lib/db-errors.js'
import { conflict } from '../lib/errors.js'

export type User = Omit<UserRow, 'passwordHash'>
type Role = UserRow['role']
type Status = UserRow['status']

const publicColumns = {
  id: users.id,
  name: users.name,
  email: users.email,
  role: users.role,
  status: users.status,
  createdAt: users.createdAt,
  updatedAt: users.updatedAt,
}

export async function create(
  db: Db,
  input: { name: string; email: string; passwordHash: string; role: Role; status: Status },
): Promise<User> {
  try {
    const [user] = await db
      .insert(users)
      .values({ ...input, email: input.email.trim().toLowerCase() })
      .returning(publicColumns)
    return user!
  } catch (error) {
    if (isUniqueViolation(error)) throw conflict('EMAIL_TAKEN', 'E-mail já cadastrado.')
    throw error
  }
}

export async function findByEmailWithHash(db: Db, email: string): Promise<UserRow | null> {
  const [user] = await db.select().from(users).where(eq(users.email, email.trim().toLowerCase()))
  return user ?? null
}

export async function findById(db: Db, id: string): Promise<User | null> {
  const [user] = await db.select(publicColumns).from(users).where(eq(users.id, id))
  return user ?? null
}

export async function countAll(db: Db): Promise<number> {
  const [row] = await db.select({ value: count() }).from(users)
  return row?.value ?? 0
}

export async function countActiveAdmins(db: Db): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(users)
    .where(and(eq(users.role, 'admin'), eq(users.status, 'active')))
  return row?.value ?? 0
}

export async function list(db: Db, filter: { status?: Status }): Promise<User[]> {
  const where: SQL | undefined = filter.status ? eq(users.status, filter.status) : undefined
  return db.select(publicColumns).from(users).where(where).orderBy(asc(users.createdAt))
}

export async function update(
  db: Db,
  id: string,
  changes: { status?: Status; role?: Role },
): Promise<User | null> {
  const [user] = await db.update(users).set(changes).where(eq(users.id, id)).returning(publicColumns)
  return user ?? null
}

export async function listActive(db: Db): Promise<{ id: string; name: string }[]> {
  return db.select({ id: users.id, name: users.name }).from(users).where(eq(users.status, 'active')).orderBy(asc(users.name))
}
