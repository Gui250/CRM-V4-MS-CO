'use client'

import { useQueryClient } from '@tanstack/react-query'
import { Fragment, useLayoutEffect, useRef } from 'react'
import { upsertMessage } from '@/lib/chat-cache'
import { formatDayLabel, isSameDay } from '@/lib/format'
import { useMessages } from '@/lib/use-chat'
import { MessageBubble } from './message-bubble'

const LOAD_OLDER_THRESHOLD_PX = 80
const NEAR_BOTTOM_PX = 120

export function MessageThread({ conversationId }: { conversationId: string }) {
  const queryClient = useQueryClient()
  const { data, isLoading, isError, hasNextPage, fetchNextPage, isFetchingNextPage } = useMessages(conversationId)
  const scroller = useRef<HTMLDivElement>(null)
  const anchor = useRef<{ height: number; top: number } | null>(null)
  const wasNearBottom = useRef(true)
  const lastNewestId = useRef<string | undefined>(undefined)

  // Pages are newest-first; the thread reads oldest at the top.
  const messages = (data?.pages.flatMap((page) => page.items) ?? []).slice().reverse()
  const newestId = messages.at(-1)?.id
  const pageCount = data?.pages.length ?? 0

  // After older messages load, keep the viewport on the same message instead of jumping.
  useLayoutEffect(() => {
    const el = scroller.current
    if (!el || !anchor.current) return
    el.scrollTop = anchor.current.top + (el.scrollHeight - anchor.current.height)
    anchor.current = null
  }, [pageCount])

  // New message at the bottom: follow it only if the reader was already at the bottom.
  useLayoutEffect(() => {
    const el = scroller.current
    if (!el || !newestId || newestId === lastNewestId.current) return
    const first = lastNewestId.current === undefined
    lastNewestId.current = newestId
    if (first || wasNearBottom.current) el.scrollTop = el.scrollHeight
  }, [newestId])

  function onScroll() {
    const el = scroller.current
    if (!el) return
    wasNearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX
    if (el.scrollTop < LOAD_OLDER_THRESHOLD_PX && hasNextPage && !isFetchingNextPage) {
      anchor.current = { height: el.scrollHeight, top: el.scrollTop }
      void fetchNextPage()
    }
  }

  return (
    <div ref={scroller} onScroll={onScroll} data-testid="thread" className="h-full overflow-y-auto bg-mist px-3 py-4 md:px-8">
      {isLoading && <p className="text-center text-sm text-muted">Carregando mensagens…</p>}
      {isError && <p className="text-center text-sm text-brand">Não foi possível carregar as mensagens.</p>}
      {isFetchingNextPage && <p className="pb-3 text-center text-xs text-muted">Carregando mensagens anteriores…</p>}
      {!isLoading && !isError && messages.length === 0 && (
        <p className="text-center text-sm text-muted">Nenhuma mensagem nesta conversa ainda.</p>
      )}
      <ol aria-label="Mensagens" className="flex flex-col gap-2.5">
        {messages.map((message, index) => {
          const previous = messages[index - 1]
          const newDay = !previous || !isSameDay(previous.sentAt, message.sentAt)
          return (
            <Fragment key={message.id}>
              {newDay && (
                <li role="separator" className="my-3 flex items-center gap-3">
                  <span className="h-px flex-1 bg-line" />
                  <span className="font-mono text-[11px] tracking-[0.15em] text-muted uppercase">{formatDayLabel(message.sentAt)}</span>
                  <span className="h-px flex-1 bg-line" />
                </li>
              )}
              <li>
                <MessageBubble message={message} onRetried={(updated) => upsertMessage(queryClient, updated)} />
              </li>
            </Fragment>
          )
        })}
      </ol>
    </div>
  )
}
