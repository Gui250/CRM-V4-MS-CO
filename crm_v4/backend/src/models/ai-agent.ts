import { asc, eq } from 'drizzle-orm'
import type { Db } from '../db/client.js'
import { aiAgents, aiProviders, type AiAgentRow, type AiProviderRow } from '../db/schema.js'
import { isUniqueViolation } from '../lib/db-errors.js'
import { conflict } from '../lib/errors.js'

export type AiAgentWithProvider = AiAgentRow & { provider: Pick<AiProviderRow, 'id' | 'name' | 'vendor'> }

type AgentFields = Pick<AiAgentRow, 'name' | 'providerId' | 'model' | 'instructions' | 'historySize'>

const nameTaken = () => conflict('AGENT_NAME_TAKEN', 'Já existe um agente com este nome.')

async function withUniqueName<T>(write: () => Promise<T>): Promise<T> {
  try {
    return await write()
  } catch (error) {
    if (isUniqueViolation(error)) throw nameTaken()
    throw error
  }
}

function selectWithProvider(db: Db) {
  return db
    .select({ agent: aiAgents, provider: { id: aiProviders.id, name: aiProviders.name, vendor: aiProviders.vendor } })
    .from(aiAgents)
    .innerJoin(aiProviders, eq(aiProviders.id, aiAgents.providerId))
}

type Joined = { agent: AiAgentRow; provider: AiAgentWithProvider['provider'] }
const toAgent = (row: Joined): AiAgentWithProvider => ({ ...row.agent, provider: row.provider })

export async function create(db: Db, input: AgentFields & { createdByUserId: string }): Promise<AiAgentWithProvider> {
  const [row] = await withUniqueName(() => db.insert(aiAgents).values(input).returning({ id: aiAgents.id }))
  return (await findById(db, row!.id))!
}

export async function findById(db: Db, id: string): Promise<AiAgentWithProvider | null> {
  const [row] = await selectWithProvider(db).where(eq(aiAgents.id, id))
  return row ? toAgent(row) : null
}

export async function list(db: Db): Promise<AiAgentWithProvider[]> {
  return (await selectWithProvider(db).orderBy(asc(aiAgents.name))).map(toAgent)
}

export async function listByProvider(db: Db, providerId: string): Promise<Pick<AiAgentRow, 'id' | 'name'>[]> {
  return db.select({ id: aiAgents.id, name: aiAgents.name }).from(aiAgents).where(eq(aiAgents.providerId, providerId)).orderBy(asc(aiAgents.name))
}

export async function update(db: Db, id: string, patch: Partial<AgentFields & Pick<AiAgentRow, 'isActive'>>): Promise<AiAgentWithProvider | null> {
  await withUniqueName(() => db.update(aiAgents).set(patch).where(eq(aiAgents.id, id)))
  return findById(db, id)
}

export async function remove(db: Db, id: string): Promise<void> {
  await db.delete(aiAgents).where(eq(aiAgents.id, id))
}
