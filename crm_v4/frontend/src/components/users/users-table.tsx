'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { ApiError, apiFetch } from '@/lib/api'
import type { User, UserRole, UserStatus } from '@/lib/types'

const TABS: { status: UserStatus; label: string; empty: string }[] = [
  { status: 'pending', label: 'Aguardando aprovação', empty: 'Nenhum cadastro aguardando aprovação.' },
  { status: 'active', label: 'Ativos', empty: 'Nenhum usuário ativo.' },
  { status: 'disabled', label: 'Desativados', empty: 'Nenhum usuário desativado.' },
]

type Change = { id: string; status?: UserStatus; role?: UserRole }

export function UsersTable({ currentUserId }: { currentUserId: string }) {
  const [tab, setTab] = useState<UserStatus>('pending')
  const [error, setError] = useState<string | null>(null)
  const queryClient = useQueryClient()
  const { data: users = [], isLoading } = useQuery({
    queryKey: ['users', tab],
    queryFn: () => apiFetch<User[]>(`/api/users?status=${tab}`),
  })

  const change = useMutation({
    mutationFn: ({ id, ...body }: Change) => apiFetch<User>(`/api/users/${id}`, { method: 'PATCH', json: body }),
    onMutate: () => setError(null),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Não foi possível salvar a alteração.'),
  })

  const current = TABS.find((t) => t.status === tab)!

  return (
    <div className="flex flex-col gap-5">
      <div role="tablist" aria-label="Situação" className="flex flex-wrap gap-1 border-b border-line">
        {TABS.map((t) => (
          <button
            key={t.status}
            role="tab"
            aria-selected={tab === t.status}
            onClick={() => setTab(t.status)}
            className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-semibold ${tab === t.status ? 'border-brand text-ink' : 'border-transparent text-muted hover:text-ink'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && (
        <p role="alert" className="border-l-4 border-brand bg-brand/5 px-3 py-2 text-sm">
          {error}
        </p>
      )}

      {isLoading ? (
        <p className="text-sm text-muted">Carregando…</p>
      ) : users.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted">{current.empty}</p>
      ) : (
        <ul className="divide-y divide-line border-y border-line">
          {users.map((user) => (
            <li key={user.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="font-semibold">
                  {user.name}
                  {user.id === currentUserId && <span className="ml-2 text-xs font-normal text-muted">(você)</span>}
                </p>
                <p className="truncate font-mono text-xs text-muted">
                  {user.email} · {user.role === 'admin' ? 'Administrador' : 'Atendente'}
                </p>
              </div>
              <UserActions user={user} isSelf={user.id === currentUserId} busy={change.isPending} onChange={(c) => change.mutate({ id: user.id, ...c })} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function UserActions({
  user,
  isSelf,
  busy,
  onChange,
}: {
  user: User
  isSelf: boolean
  busy: boolean
  onChange: (change: Omit<Change, 'id'>) => void
}) {
  if (user.status === 'pending') {
    return (
      <Button onClick={() => onChange({ status: 'active' })} disabled={busy}>
        Aprovar
      </Button>
    )
  }
  if (user.status === 'disabled') {
    return (
      <Button variant="secondary" onClick={() => onChange({ status: 'active' })} disabled={busy}>
        Reativar
      </Button>
    )
  }
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="secondary" onClick={() => onChange({ role: user.role === 'admin' ? 'attendant' : 'admin' })} disabled={busy}>
        {user.role === 'admin' ? 'Tornar atendente' : 'Tornar administrador'}
      </Button>
      {!isSelf && (
        <Button variant="danger" onClick={() => onChange({ status: 'disabled' })} disabled={busy}>
          Desativar
        </Button>
      )}
    </div>
  )
}
