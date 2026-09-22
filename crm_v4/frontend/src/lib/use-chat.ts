'use client'

import { useInfiniteQuery } from '@tanstack/react-query'
import { apiFetch } from './api'
import { conversationsKey, messagesKey, type Filters } from './chat-cache'
import type { Conversation, Message, Page } from './types'

const PAGE_SIZE = 50

function withCursor(path: string, params: Record<string, string>, cursor: string | null) {
  const search = new URLSearchParams({ ...params, limit: String(PAGE_SIZE) })
  if (cursor) search.set('cursor', cursor)
  return `${path}?${search}`
}

export function useConversations(filters: Filters) {
  const params: Record<string, string> = {}
  if (filters.search) params.search = filters.search
  if (filters.unread) params.unread = 'true'
  if (filters.awaitingHuman) params.handling = 'awaiting_human'
  return useInfiniteQuery({
    queryKey: conversationsKey(filters),
    queryFn: ({ pageParam }) => apiFetch<Page<Conversation>>(withCursor('/api/conversations', params, pageParam)),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  })
}

export function useMessages(conversationId: string) {
  return useInfiniteQuery({
    queryKey: messagesKey(conversationId),
    queryFn: ({ pageParam }) => apiFetch<Page<Message>>(withCursor(`/api/conversations/${conversationId}/messages`, {}, pageParam)),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  })
}
