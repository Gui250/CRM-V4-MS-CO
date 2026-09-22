import type { InfiniteData, QueryClient } from '@tanstack/react-query'
import { isAwaitingHuman } from './automation-types'
import type { Conversation, Message, Page } from './types'

/** `awaitingHuman` lists only conversations handed off and not yet assumed (feature 003). */
export type Filters = { search: string; unread: boolean; awaitingHuman?: boolean }
export const conversationsKey = (filters: Filters) => ['conversations', filters] as const
export const messagesKey = (conversationId: string) => ['messages', conversationId] as const

type Pages<T> = InfiniteData<Page<T>, string | null>

const isUnfiltered = (key: readonly unknown[]) => {
  const filters = key[1] as Filters | undefined
  return !filters || (!filters.search && !filters.unread && !filters.awaitingHuman)
}

const isAwaitingList = (key: readonly unknown[]) => Boolean((key[1] as Filters | undefined)?.awaitingHuman)

/** Inserts or replaces a message; pages are newest first, so new ones go to the front of page 0. */
export function upsertMessage(client: QueryClient, message: Message) {
  client.setQueryData<Pages<Message>>(messagesKey(message.conversationId), (data) => {
    if (!data) return data
    const exists = data.pages.some((page) => page.items.some((m) => m.id === message.id))
    if (exists) {
      return { ...data, pages: data.pages.map((page) => ({ ...page, items: page.items.map((m) => (m.id === message.id ? message : m)) })) }
    }
    const [first, ...rest] = data.pages
    return first ? { ...data, pages: [{ ...first, items: [message, ...first.items] }, ...rest] } : data
  })
}

/** Moves the conversation to the top of unfiltered lists; filtered lists are refetched. */
export function bumpConversation(client: QueryClient, conversation: Conversation) {
  for (const [key] of client.getQueriesData<Pages<Conversation>>({ queryKey: ['conversations'] })) {
    if (!isUnfiltered(key)) {
      void client.invalidateQueries({ queryKey: key, exact: true })
      continue
    }
    client.setQueryData<Pages<Conversation>>(key, (data) => {
      if (!data) return data
      const pages = data.pages.map((page) => ({ ...page, items: page.items.filter((c) => c.id !== conversation.id) }))
      const [first, ...rest] = pages
      return first ? { ...data, pages: [{ ...first, items: [conversation, ...first.items] }, ...rest] } : data
    })
  }
}

/** Replaces a conversation in place (e.g. unread reset) without reordering. */
export function replaceConversation(client: QueryClient, conversation: Conversation) {
  client.setQueriesData<Pages<Conversation>>({ queryKey: ['conversations'] }, (data) =>
    data
      ? { ...data, pages: data.pages.map((page) => ({ ...page, items: page.items.map((c) => (c.id === conversation.id ? conversation : c)) })) }
      : data,
  )
  syncAwaitingHuman(client, conversation)
}

/** Drops assumed/released conversations from "Aguardando humano" lists; refetches them when one newly qualifies. */
export function syncAwaitingHuman(client: QueryClient, conversation: Conversation) {
  for (const [key, data] of client.getQueriesData<Pages<Conversation>>({ queryKey: ['conversations'] })) {
    if (!data || !isAwaitingList(key)) continue
    const present = data.pages.some((page) => page.items.some((c) => c.id === conversation.id))
    if (isAwaitingHuman(conversation.handling)) {
      if (!present) void client.invalidateQueries({ queryKey: key, exact: true })
    } else if (present) {
      client.setQueryData<Pages<Conversation>>(key, {
        ...data,
        pages: data.pages.map((page) => ({ ...page, items: page.items.filter((c) => c.id !== conversation.id) })),
      })
    }
  }
}

export function findConversation(client: QueryClient, id: string): Conversation | undefined {
  for (const [, data] of client.getQueriesData<Pages<Conversation>>({ queryKey: ['conversations'] })) {
    const found = data?.pages.flatMap((page) => page.items).find((c) => c.id === id)
    if (found) return found
  }
  return undefined
}
