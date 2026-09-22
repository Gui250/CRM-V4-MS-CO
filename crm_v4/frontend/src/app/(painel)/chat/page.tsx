'use client'

import { useQueryClient } from '@tanstack/react-query'
import Image from 'next/image'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { Composer } from '@/components/chat/composer'
import { ContactAvatar } from '@/components/chat/contact-avatar'
import { ConversationList } from '@/components/chat/conversation-list'
import { ConversationSearch } from '@/components/chat/conversation-search'
import { AutomationIndicator } from '@/components/chat/automation-indicator'
import { HandoffBanner } from '@/components/chat/handoff-banner'
import { NewConversationFlow } from '@/components/chat/new-conversation-flow'
import { StartFlowMenu } from '@/components/chat/start-flow-menu'
import { LeadStrip } from '@/components/chat/lead-strip'
import { MessageThread } from '@/components/chat/message-thread'
import { apiFetch } from '@/lib/api'
import { findConversation, replaceConversation, upsertMessage, type Filters } from '@/lib/chat-cache'
import { displayName, formatPhone } from '@/lib/format'
import { reportError } from '@/lib/logger'
import { useConversations } from '@/lib/use-chat'
import { useConnection } from '@/lib/use-connection'

export default function ChatPage() {
  return (
    <Suspense>
      <Chat />
    </Suspense>
  )
}

/** Marks the open conversation as read whenever it has unread messages (on open and on new arrivals). */
function useMarkRead(conversationId: string | null, unreadCount: number) {
  const queryClient = useQueryClient()
  const inFlight = useRef<string | null>(null)
  useEffect(() => {
    if (!conversationId || unreadCount === 0 || inFlight.current === conversationId) return
    inFlight.current = conversationId
    apiFetch(`/api/conversations/${conversationId}/read`, { method: 'POST' })
      .then(() => {
        const current = findConversation(queryClient, conversationId)
        if (current) replaceConversation(queryClient, { ...current, unreadCount: 0 })
      })
      .catch((error: unknown) => reportError(error, 'mark read'))
      .finally(() => {
        inFlight.current = null
      })
  }, [conversationId, unreadCount, queryClient])
}

function Chat() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const queryClient = useQueryClient()
  const selectedId = params.get('c')
  const [filters, setFilters] = useState<Filters>({ search: '', unread: false })
  const { data: connection } = useConnection()

  // Subscribes to the same list the sidebar shows, so the header and unread count stay live.
  useConversations(filters)
  const selected = selectedId ? findConversation(queryClient, selectedId) : undefined
  useMarkRead(selectedId, selected?.unreadCount ?? 0)

  const select = useCallback(
    (id: string | null) => router.replace(id ? `${pathname}?c=${id}` : pathname, { scroll: false }),
    [router, pathname],
  )

  return (
    <div className="grid h-full md:grid-cols-[minmax(18rem,22rem)_1fr]">
      <aside className={`min-h-0 flex-col border-r border-line bg-paper ${selectedId ? 'hidden md:flex' : 'flex'}`}>
        <div className="px-4 pt-5 pb-1">
          <h1 className="font-display text-xl font-extrabold uppercase [font-stretch:115%]">Conversas</h1>
        </div>
        <NewConversationFlow onStarted={select} />
        <ConversationSearch value={filters} onChange={setFilters} />
        <div className="min-h-0 flex-1 overflow-y-auto">
          <ConversationList filters={filters} selectedId={selectedId} onSelect={select} />
        </div>
      </aside>

      <section className={`min-h-0 flex-col ${selectedId ? 'flex' : 'hidden md:flex'}`}>
        {selectedId ? (
          <>
            <header className="flex items-center gap-3 border-b-2 border-brand bg-paper px-3 py-3 md:px-6">
              <button onClick={() => select(null)} className="px-2 py-1 text-sm font-semibold text-brand md:hidden" aria-label="Voltar para conversas">
                ← Voltar
              </button>
              {selected && <ContactAvatar contact={selected.contact} size="lg" />}
              <div className="min-w-0">
                <h2 className="truncate font-semibold">{selected ? displayName(selected.contact) : 'Conversa'}</h2>
                {selected?.contact.name && <p className="font-mono text-xs text-muted">{formatPhone(selected.contact.phone)}</p>}
                {selected && <LeadStrip contactId={selected.contact.id} />}
              </div>
              <div className="ml-auto shrink-0">
                <StartFlowMenu conversationId={selectedId} disabled={connection?.status !== 'connected'} />
              </div>
            </header>
            {selected && (
              <HandoffBanner
                conversationId={selectedId}
                contactId={selected.contact.id}
                handling={selected.handling}
                automationOptOut={selected.automationOptOut}
              />
            )}
            <AutomationIndicator conversationId={selectedId} />
            <div className="min-h-0 flex-1">
              <MessageThread key={selectedId} conversationId={selectedId} />
            </div>
            <Composer
              key={selectedId}
              conversationId={selectedId}
              disabled={connection?.status !== 'connected'}
              onSent={(message) => upsertMessage(queryClient, message)}
            />
          </>
        ) : (
          <div className="grid h-full place-items-center bg-mist p-8">
            <div className="flex max-w-xs flex-col items-center gap-5 text-center">
              <Image src="/logo-v4.jpeg" alt="" width={88} height={88} className="cut-corner [--cut:18px]" />
              <p className="font-display text-lg font-extrabold uppercase [font-stretch:115%]">V4 Company MS&amp;CO</p>
              <p className="text-sm text-muted">Escolha uma conversa na lista para ler e responder.</p>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
