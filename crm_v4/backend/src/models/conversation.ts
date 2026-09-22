import { and, desc, eq, gt, ilike, isNull, or, sql, type SQL } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import type { Db } from '../db/client.js'
import { contacts, conversations, users, type ContactRow, type ConversationRow } from '../db/schema.js'

/** `assumedBy` is filled by findById/list; optional so callers building rows by hand still type-check. */
export type ConversationWithContact = ConversationRow & { contact: ContactRow; assumedBy?: { id: string; name: string } | null }

export const HANDOFF_SUMMARY_MAX = 1000

const assumedByUser = alias(users, 'assumed_by_user')
const assumedBySelection = { id: assumedByUser.id, name: assumedByUser.name }
// Drizzle returns the whole left-joined object as null when there is no assignee.
const withAssumedBy = (row: {
  conversation: ConversationRow
  contact: ContactRow
  assumedBy: { id: string; name: string } | null
}): ConversationWithContact => ({ ...row.conversation, contact: row.contact, assumedBy: row.assumedBy })

export const PREVIEW_MAX = 120

// Conversations are ordered by their latest message; new ones without messages by creation.
const sortAt = sql`coalesce(${conversations.lastMessageAt}, ${conversations.createdAt})`

const encodeCursor = (at: string, id: string) => Buffer.from(`${at}|${id}`).toString('base64url')

function decodeCursor(cursor: string): { at: string; id: string } | null {
  const [at, id] = Buffer.from(cursor, 'base64url').toString().split('|')
  return at && id ? { at, id } : null
}

const escapeLike = (term: string) => term.replace(/[\\%_]/g, (char) => `\\${char}`)

export async function getOrCreateForContact(db: Db, contactId: string): Promise<ConversationRow> {
  await db.insert(conversations).values({ contactId }).onConflictDoNothing({ target: conversations.contactId })
  const [row] = await db.select().from(conversations).where(eq(conversations.contactId, contactId))
  return row!
}

export async function findById(db: Db, id: string): Promise<ConversationWithContact | null> {
  const [row] = await db
    .select({ conversation: conversations, contact: contacts, assumedBy: assumedBySelection })
    .from(conversations)
    .innerJoin(contacts, eq(contacts.id, conversations.contactId))
    .leftJoin(assumedByUser, eq(assumedByUser.id, conversations.assumedByUserId))
    .where(eq(conversations.id, id))
  return row ? withAssumedBy(row) : null
}

export async function list(
  db: Db,
  options: { cursor?: string; limit: number; search?: string; unread?: boolean; handling?: 'awaiting_human' },
): Promise<{ items: ConversationWithContact[]; nextCursor: string | null }> {
  const filters: (SQL | undefined)[] = []
  const cursor = options.cursor ? decodeCursor(options.cursor) : null
  if (cursor) filters.push(sql`(${sortAt}, ${conversations.id}) < (${cursor.at}::timestamptz, ${cursor.id}::uuid)`)
  if (options.unread) filters.push(gt(conversations.unreadCount, 0))
  if (options.handling === 'awaiting_human') {
    filters.push(eq(conversations.handlingMode, 'human'), isNull(conversations.assumedByUserId))
  }
  const term = options.search?.trim()
  if (term) {
    const pattern = `%${escapeLike(term)}%`
    const digits = term.replace(/\D/g, '')
    filters.push(or(ilike(contacts.name, pattern), digits ? ilike(contacts.phone, `%${digits}%`) : undefined))
  }

  const rows = await db
    .select({ conversation: conversations, contact: contacts, assumedBy: assumedBySelection, sortKey: sql<string>`${sortAt}::text` })
    .from(conversations)
    .innerJoin(contacts, eq(contacts.id, conversations.contactId))
    .leftJoin(assumedByUser, eq(assumedByUser.id, conversations.assumedByUserId))
    .where(and(...filters))
    .orderBy(desc(sortAt), desc(conversations.id))
    .limit(options.limit + 1)

  const page = rows.slice(0, options.limit)
  const last = page.at(-1)
  return {
    items: page.map(withAssumedBy),
    nextCursor: rows.length > options.limit && last ? encodeCursor(last.sortKey, last.conversation.id) : null,
  }
}

/** Records a new latest message. Only moves forward in time, so late webhooks don't reorder the list. */
export async function touch(
  db: Db,
  id: string,
  update: { at: Date; preview: string; incrementUnread: boolean },
): Promise<void> {
  const preview = update.preview.length > PREVIEW_MAX ? `${update.preview.slice(0, PREVIEW_MAX - 1)}…` : update.preview
  const isNewer = sql`${conversations.lastMessageAt} IS NULL OR ${conversations.lastMessageAt} <= ${update.at.toISOString()}::timestamptz`
  await db
    .update(conversations)
    .set({
      lastMessageAt: sql`CASE WHEN ${isNewer} THEN ${update.at.toISOString()}::timestamptz ELSE ${conversations.lastMessageAt} END`,
      lastMessagePreview: sql`CASE WHEN ${isNewer} THEN ${preview} ELSE ${conversations.lastMessagePreview} END`,
      unreadCount: update.incrementUnread ? sql`${conversations.unreadCount} + 1` : conversations.unreadCount,
    })
    .where(eq(conversations.id, id))
}

export async function markRead(db: Db, id: string): Promise<void> {
  await db.update(conversations).set({ unreadCount: 0 }).where(eq(conversations.id, id))
}

/** Automation stops here; nobody has taken it yet ("aguardando humano", FR-023). */
export async function handOff(db: Db, id: string, input: { reason: string; summary: string | null }): Promise<void> {
  await db
    .update(conversations)
    .set({
      handlingMode: 'human',
      handoffReason: input.reason,
      handoffSummary: input.summary?.slice(0, HANDOFF_SUMMARY_MAX) ?? null,
      handoffAt: new Date(),
      assumedByUserId: null,
    })
    .where(eq(conversations.id, id))
}

/** An attendant takes the conversation; keeps the hand-off reason and summary if there was one. */
export async function assume(db: Db, id: string, userId: string): Promise<void> {
  await db.update(conversations).set({ handlingMode: 'human', assumedByUserId: userId }).where(eq(conversations.id, id))
}

/** Back to automation (FR-025). */
export async function release(db: Db, id: string): Promise<void> {
  await db
    .update(conversations)
    .set({ handlingMode: 'automation', handoffReason: null, handoffSummary: null, handoffAt: null, assumedByUserId: null })
    .where(eq(conversations.id, id))
}
