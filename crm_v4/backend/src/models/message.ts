import { and, desc, eq, inArray, ne, sql } from 'drizzle-orm'
import type { Db } from '../db/client.js'
import { aiAgents, flowRuns, flows, messages, users, type MessageRow } from '../db/schema.js'

export type MessageAutomation = { kind: 'flow' | 'agent'; name: string } | null
/** `automation` is filled by every read here; optional so rows built by hand still type-check. */
export type MessageWithSender = MessageRow & { sentBy: { id: string; name: string } | null; automation?: MessageAutomation }
type Status = NonNullable<MessageRow['status']>
type NewMessage = Pick<MessageRow, 'conversationId' | 'type'> &
  Partial<Pick<MessageRow, 'body' | 'mediaMime' | 'mediaFilename' | 'mediaSize' | 'sentAt'>>

/** Delivery only moves forward: a late "delivered" never overwrites "read". */
export const STATUS_RANK: Record<Status, number> = { failed: 0, pending: 1, sent: 2, delivered: 3, read: 4 }

const lowerStatuses = (status: Status) =>
  (Object.keys(STATUS_RANK) as Status[]).filter((s) => s !== 'failed' && STATUS_RANK[s] < STATUS_RANK[status])

const encodeCursor = (at: string, id: string) => Buffer.from(`${at}|${id}`).toString('base64url')
function decodeCursor(cursor: string) {
  const [at, id] = Buffer.from(cursor, 'base64url').toString().split('|')
  return at && id ? { at, id } : null
}

const joinedColumns = {
  message: messages,
  sender: { id: users.id, name: users.name },
  flowName: flows.name,
  agentName: aiAgents.name,
}

function selectWithSender(db: Db) {
  return db
    .select(joinedColumns)
    .from(messages)
    .leftJoin(users, eq(users.id, messages.sentByUserId))
    .leftJoin(flowRuns, eq(flowRuns.id, messages.flowRunId))
    .leftJoin(flows, eq(flows.id, flowRuns.flowId))
    .leftJoin(aiAgents, eq(aiAgents.id, messages.aiAgentId))
}

type Joined = { message: MessageRow; sender: { id: string; name: string } | null; flowName: string | null; agentName: string | null }

// The agent name wins: a flow's agent block sends as the agent (FR-010).
const automationOf = (row: Joined): MessageAutomation =>
  row.agentName ? { kind: 'agent', name: row.agentName } : row.flowName ? { kind: 'flow', name: row.flowName } : null

const withSender = (row: Joined): MessageWithSender => ({
  ...row.message,
  sentBy: row.sender?.id ? row.sender : null,
  automation: automationOf(row),
})

export async function findById(db: Db, id: string): Promise<MessageWithSender | null> {
  const [row] = await selectWithSender(db).where(eq(messages.id, id))
  return row ? withSender(row) : null
}

export async function findByWaId(db: Db, waMessageId: string): Promise<MessageWithSender | null> {
  const [row] = await selectWithSender(db).where(eq(messages.waMessageId, waMessageId))
  return row ? withSender(row) : null
}

/** Idempotent on wa_message_id: a re-delivered webhook returns the existing row with created=false. */
export async function insertFromWhatsApp(
  db: Db,
  input: NewMessage & { waMessageId: string; direction: MessageRow['direction'] },
): Promise<{ message: MessageWithSender; created: boolean }> {
  const [inserted] = await db
    .insert(messages)
    .values({ ...input, status: input.direction === 'outbound' ? 'sent' : null })
    .onConflictDoNothing({ target: messages.waMessageId })
    .returning({ id: messages.id })
  const message = inserted ? await findById(db, inserted.id) : await findByWaId(db, input.waMessageId)
  return { message: message!, created: Boolean(inserted) }
}

/** A message typed in the panel or sent by an automation, before WhatsApp assigns it an id. */
export async function insertPending(
  db: Db,
  input: NewMessage & { sentByUserId?: string | null; flowRunId?: string | null; aiAgentId?: string | null },
): Promise<MessageWithSender> {
  const [row] = await db
    .insert(messages)
    .values({ ...input, direction: 'outbound', status: 'pending' })
    .returning({ id: messages.id })
  return (await findById(db, row!.id))!
}

/**
 * Stores WhatsApp's id on a pending message. If a webhook already recorded the same WhatsApp
 * message (race), keep that row, credit it to the sender, and drop the pending duplicate.
 */
export async function markSent(db: Db, id: string, waMessageId: string): Promise<MessageWithSender> {
  const existing = await findByWaId(db, waMessageId)
  if (existing && existing.id !== id) {
    const pending = await findById(db, id)
    await db
      .update(messages)
      .set({ sentByUserId: pending?.sentByUserId ?? null, flowRunId: pending?.flowRunId ?? null, aiAgentId: pending?.aiAgentId ?? null })
      .where(eq(messages.id, existing.id))
    await db.delete(messages).where(eq(messages.id, id))
    return (await findById(db, existing.id))!
  }
  await db
    .update(messages)
    .set({ waMessageId, status: sql`CASE WHEN ${messages.status} = 'pending' THEN 'sent'::message_status ELSE ${messages.status} END`, error: null })
    .where(eq(messages.id, id))
  return (await findById(db, id))!
}

export async function markFailed(db: Db, id: string, error: string): Promise<MessageWithSender | null> {
  await db.update(messages).set({ status: 'failed', error }).where(and(eq(messages.id, id), eq(messages.status, 'pending')))
  return findById(db, id)
}

/** Returns null when the message is not failed. */
export async function resetForRetry(db: Db, id: string): Promise<MessageWithSender | null> {
  const [row] = await db
    .update(messages)
    .set({ status: 'pending', error: null })
    .where(and(eq(messages.id, id), eq(messages.status, 'failed')))
    .returning({ id: messages.id })
  return row ? findById(db, row.id) : null
}

/** Returns the updated message, or null when unknown or the status would move backwards. */
export async function advanceStatus(db: Db, waMessageId: string, status: Status): Promise<MessageWithSender | null> {
  const lower = lowerStatuses(status)
  if (lower.length === 0) return null
  const [row] = await db
    .update(messages)
    .set({ status })
    .where(and(eq(messages.waMessageId, waMessageId), eq(messages.direction, 'outbound'), inArray(messages.status, lower)))
    .returning({ id: messages.id })
  return row ? findById(db, row.id) : null
}

export async function setMedia(
  db: Db,
  id: string,
  media: { mediaPath: string; mediaMime: string; mediaFilename: string | null; mediaSize: number },
): Promise<MessageWithSender | null> {
  await db.update(messages).set(media).where(eq(messages.id, id))
  return findById(db, id)
}

export async function latestInbound(db: Db, conversationId: string): Promise<MessageRow | null> {
  const [row] = await db
    .select()
    .from(messages)
    .where(and(eq(messages.conversationId, conversationId), eq(messages.direction, 'inbound')))
    .orderBy(desc(messages.sentAt))
    .limit(1)
  return row ?? null
}

/** True when the conversation has an inbound message other than `messageId` (so it is not the first contact). */
export async function hasOtherInbound(db: Db, conversationId: string, messageId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: messages.id })
    .from(messages)
    .where(and(eq(messages.conversationId, conversationId), eq(messages.direction, 'inbound'), ne(messages.id, messageId)))
    .limit(1)
  return Boolean(row)
}

/** Newest first; the cursor fetches older messages. */
export async function listByConversation(
  db: Db,
  conversationId: string,
  options: { cursor?: string; limit: number },
): Promise<{ items: MessageWithSender[]; nextCursor: string | null }> {
  const cursor = options.cursor ? decodeCursor(options.cursor) : null
  const rows = await db
    .select({ ...joinedColumns, sortKey: sql<string>`${messages.sentAt}::text` })
    .from(messages)
    .leftJoin(users, eq(users.id, messages.sentByUserId))
    .leftJoin(flowRuns, eq(flowRuns.id, messages.flowRunId))
    .leftJoin(flows, eq(flows.id, flowRuns.flowId))
    .leftJoin(aiAgents, eq(aiAgents.id, messages.aiAgentId))
    .where(
      and(
        eq(messages.conversationId, conversationId),
        cursor ? sql`(${messages.sentAt}, ${messages.id}) < (${cursor.at}::timestamptz, ${cursor.id}::uuid)` : undefined,
      ),
    )
    .orderBy(desc(messages.sentAt), desc(messages.id))
    .limit(options.limit + 1)

  const page = rows.slice(0, options.limit)
  const last = page.at(-1)
  return {
    items: page.map(withSender),
    nextCursor: rows.length > options.limit && last ? encodeCursor(last.sortKey, last.message.id) : null,
  }
}

/** The agent's context window (research §6): the last `limit` messages, oldest first. */
export async function listRecentForAgent(
  db: Db,
  conversationId: string,
  limit: number,
): Promise<Pick<MessageRow, 'id' | 'direction' | 'type' | 'body' | 'sentAt'>[]> {
  const rows = await db
    .select({ id: messages.id, direction: messages.direction, type: messages.type, body: messages.body, sentAt: messages.sentAt })
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(desc(messages.sentAt), desc(messages.id))
    .limit(limit)
  return rows.reverse()
}
