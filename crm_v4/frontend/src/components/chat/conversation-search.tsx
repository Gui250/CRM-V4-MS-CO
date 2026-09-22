'use client'

import { useEffect, useState } from 'react'
import type { Filters } from '@/lib/chat-cache'

const DEBOUNCE_MS = 300
const SEARCH_MAX = 100

export function ConversationSearch({ value, onChange }: { value: Filters; onChange: (filters: Filters) => void }) {
  const [term, setTerm] = useState(value.search)

  useEffect(() => {
    if (term === value.search) return
    const timer = setTimeout(() => onChange({ ...value, search: term.trim() }), DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [term, value, onChange])

  return (
    <div className="flex flex-col gap-2 border-b border-line px-4 py-3">
      <input
        type="search"
        aria-label="Buscar conversa"
        placeholder="Buscar por nome ou número"
        maxLength={SEARCH_MAX}
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        className="h-10 border-b-2 border-ink/15 bg-mist px-3 text-sm outline-none focus:border-brand focus:bg-paper"
      />
      <label className="flex w-fit cursor-pointer items-center gap-2 text-xs font-semibold tracking-wide text-muted uppercase">
        <input
          type="checkbox"
          checked={value.unread}
          onChange={(e) => onChange({ ...value, unread: e.target.checked })}
          className="size-4 accent-brand"
        />
        Só não lidas
      </label>
      <label className="flex w-fit cursor-pointer items-center gap-2 text-xs font-semibold tracking-wide text-muted uppercase">
        <input
          type="checkbox"
          checked={value.awaitingHuman ?? false}
          onChange={(e) => onChange({ ...value, awaitingHuman: e.target.checked })}
          className="size-4 accent-brand"
        />
        Aguardando humano
      </label>
    </div>
  )
}
