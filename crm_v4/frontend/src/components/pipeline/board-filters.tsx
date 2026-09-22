'use client'

import { useEffect, useState } from 'react'
import { useAssignableUsers } from '@/lib/use-pipelines'

const DEBOUNCE_MS = 300
const SEARCH_MAX = 100

/** `assignee`: '' (todos), 'me', 'none' or a user id, exactly as kept in the URL. */
export type BoardFilterValue = { assignee: string; search: string }

export function BoardFilters({ value, onChange }: { value: BoardFilterValue; onChange: (value: BoardFilterValue) => void }) {
  const { data: users } = useAssignableUsers()
  const [term, setTerm] = useState(value.search)

  useEffect(() => {
    if (term.trim() === value.search) return
    const timer = setTimeout(() => onChange({ ...value, search: term.trim() }), DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [term, value, onChange])

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        type="search"
        aria-label="Buscar lead"
        placeholder="Buscar por nome, número ou título"
        maxLength={SEARCH_MAX}
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        className="h-9 w-full border-b-2 border-ink/15 bg-mist px-3 text-sm outline-none focus:border-brand focus:bg-paper sm:w-64"
      />
      <label className="sr-only" htmlFor="board-assignee">
        Responsável
      </label>
      <select
        id="board-assignee"
        value={value.assignee}
        onChange={(e) => onChange({ ...value, assignee: e.target.value })}
        className="h-9 bg-mist px-2 text-sm font-semibold outline-none"
      >
        <option value="">Todos os responsáveis</option>
        <option value="me">Meus leads</option>
        <option value="none">Sem responsável</option>
        {users?.map((user) => (
          <option key={user.id} value={user.id}>
            {user.name}
          </option>
        ))}
      </select>
      {(value.assignee || value.search) && (
        <button
          onClick={() => {
            setTerm('')
            onChange({ assignee: '', search: '' })
          }}
          className="text-sm font-semibold text-brand hover:underline"
        >
          Limpar filtros
        </button>
      )}
    </div>
  )
}
