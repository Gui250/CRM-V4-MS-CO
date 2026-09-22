import { asc, count, eq, getTableColumns } from 'drizzle-orm'
import type { Db } from '../db/client.js'
import { aiAgents, aiProviders, type AiProviderRow } from '../db/schema.js'
import { isUniqueViolation } from '../lib/db-errors.js'
import { conflict } from '../lib/errors.js'

export type AiProviderWithUsage = AiProviderRow & { agentCount: number }

type SealedKey = Pick<AiProviderRow, 'keyCiphertext' | 'keyIv' | 'keyAuthTag' | 'keyHint'>

const nameTaken = () => conflict('PROVIDER_NAME_TAKEN', 'Já existe um provedor com este nome.')

async function withUniqueName<T>(write: () => Promise<T>): Promise<T> {
  try {
    return await write()
  } catch (error) {
    if (isUniqueViolation(error)) throw nameTaken()
    throw error
  }
}

function selectWithUsage(db: Db) {
  return db
    .select({ ...getTableColumns(aiProviders), agentCount: count(aiAgents.id) })
    .from(aiProviders)
    .leftJoin(aiAgents, eq(aiAgents.providerId, aiProviders.id))
    .groupBy(aiProviders.id)
}

/** Only called after a successful connection test, so the status is always 'ok'. */
export async function create(
  db: Db,
  input: SealedKey & Pick<AiProviderRow, 'name' | 'vendor' | 'availableModels'>,
): Promise<AiProviderWithUsage> {
  const [row] = await withUniqueName(() =>
    db
      .insert(aiProviders)
      .values({ ...input, lastTestStatus: 'ok', lastTestedAt: new Date() })
      .returning({ id: aiProviders.id }),
  )
  return (await findById(db, row!.id))!
}

export async function findById(db: Db, id: string): Promise<AiProviderWithUsage | null> {
  const [row] = await selectWithUsage(db).where(eq(aiProviders.id, id))
  return row ?? null
}

export function list(db: Db): Promise<AiProviderWithUsage[]> {
  return selectWithUsage(db).orderBy(asc(aiProviders.name))
}

/** A new key or model list always comes from a passed connection test. */
export async function update(
  db: Db,
  id: string,
  patch: Partial<Pick<AiProviderRow, 'name' | 'availableModels'> & SealedKey> & { tested?: boolean },
): Promise<AiProviderWithUsage | null> {
  const { tested, ...fields } = patch
  await withUniqueName(() =>
    db
      .update(aiProviders)
      .set({ ...fields, ...(tested ? { lastTestStatus: 'ok' as const, lastTestedAt: new Date() } : {}) })
      .where(eq(aiProviders.id, id)),
  )
  return findById(db, id)
}

export async function remove(db: Db, id: string): Promise<void> {
  await db.delete(aiProviders).where(eq(aiProviders.id, id))
}
