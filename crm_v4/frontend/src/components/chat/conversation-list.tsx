'use client'

import { useEffect, useRef } from 'react'
import { Badge } from '@/components/ui/badge'
import { isAwaitingHuman } from '@/lib/automation-types'
import type { Filters } from '@/lib/chat-cache'
import { displayName, formatListTime } from '@/lib/format'
import type { Conversation } from '@/lib/types'
import { useConversations } from '@/lib/use-chat'
import { ContactAvatar } from './contact-avatar'

export function ConversationItem({
  conversation,
  selected,
  onSelect,
}: {
  conversation: Conversation
  selected: boolean
  onSelect: (id: string) => void
}) {
  const unread = conversation.unreadCount > 0
  return (
    <li>
      <button
        onClick={() => onSelect(conversation.id)}
        aria-current={selected ? 'true' : undefined}
        className={`relative flex w-full items-center gap-3 px-4 py-3 text-left transition-colors ${selected ? 'bg-mist' : 'hover:bg-mist/60'}`}
      >
        {selected && <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-brand" />}
        <ContactAvatar contact={conversation.contact} />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className={`truncate ${unread ? 'font-bold' : 'font-semibold'}`}>{displayName(conversation.contact)}</span>
            {conversation.lastMessageAt && (
              <span className={`shrink-0 font-mono text-[11px] ${unread ? 'font-bold text-brand' : 'text-muted'}`}>
                {formatListTime(conversation.lastMessageAt)}
              </span>
            )}
          </span>
          <span className="mt-0.5 flex items-center justify-between gap-2">
            <span className={`truncate text-sm ${unread ? 'text-ink' : 'text-muted'}`}>{conversation.lastMessagePreview ?? ' '}</span>
            {isAwaitingHuman(conversation.handling) && (
              <span className="shrink-0 border border-brand px-1.5 font-mono text-[10px] font-bold uppercase tracking-wide text-brand">
                Aguardando humano
              </span>
            )}
            {unread && (
              <Badge>
                <span className="sr-only">Não lidas: </span>
                {conversation.unreadCount}
              </Badge>
            )}
          </span>
        </span>
      </button>
    </li>
  )
}

export function ConversationList({
  filters,
  selectedId,
  onSelect,
}: {
  filters: Filters
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  const { data, isLoading, isError, hasNextPage, fetchNextPage, isFetchingNextPage } = useConversations(filters)
  const sentinel = useRef<HTMLLIElement>(null)

  useEffect(() => {
    const node = sentinel.current
    if (!node || !hasNextPage || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting) && !isFetchingNextPage) void fetchNextPage()
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  if (isLoading) return <p className="px-4 py-6 text-sm text-muted">Carregando conversas…</p>
  if (isError) return <p className="px-4 py-6 text-sm text-brand">Não foi possível carregar as conversas.</p>

  const conversations = data?.pages.flatMap((page) => page.items) ?? []
  if (conversations.length === 0) {
    return (
      <p className="px-4 py-10 text-center text-sm text-muted">
        {filters.search || filters.unread || filters.awaitingHuman ? 'Nenhuma conversa encontrada.' : 'As conversas aparecem aqui quando um contato mandar mensagem.'}
      </p>
    )
  }

  return (
    <ul aria-label="Conversas" className="divide-y divide-line">
      {conversations.map((conversation) => (
        <ConversationItem key={conversation.id} conversation={conversation} selected={conversation.id === selectedId} onSelect={onSelect} />
      ))}
      {hasNextPage && (
        <li ref={sentinel} className="px-4 py-3 text-center text-xs text-muted">
          {isFetchingNextPage ? 'Carregando…' : ' '}
        </li>
      )}
    </ul>
  )
}
