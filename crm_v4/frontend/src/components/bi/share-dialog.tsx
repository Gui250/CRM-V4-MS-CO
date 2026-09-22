'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { ApiError, apiFetch } from '@/lib/api'
import type { Share } from '@/lib/bi/types'
import { ModalDialog } from './modal-dialog'

type Permission = Share['permission']
type UserOption = { id: string; name: string }

const PERMISSION_LABELS: Record<Permission, string> = { edit: 'Editar', view: 'Visualizar' }
const SELECT = 'h-9 border-b-2 border-ink/20 bg-mist px-2 text-sm outline-none focus:border-brand'

const sharesKey = (reportId: string) => ['bi-report-shares', reportId] as const

function PermissionSelect({ value, onChange, label }: { value: Permission; onChange: (p: Permission) => void; label: string }) {
  return (
    <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value as Permission)} className={SELECT}>
      {(['edit', 'view'] as const).map((p) => (
        <option key={p} value={p}>
          {PERMISSION_LABELS[p]}
        </option>
      ))}
    </select>
  )
}

/** Owner/admin picks who can edit or view the report (FR-032). Saves the whole list at once. */
export function ShareDialog({ reportId, currentUserId, onClose }: { reportId: string; currentUserId?: string; onClose: () => void }) {
  const client = useQueryClient()
  const shares = useQuery({ queryKey: sharesKey(reportId), queryFn: () => apiFetch<Share[]>(`/api/bi/reports/${reportId}/shares`) })
  const users = useQuery({ queryKey: ['users-assignable'], queryFn: () => apiFetch<UserOption[]>('/api/users/assignable') })
  const [draft, setDraft] = useState<Share[] | null>(null)
  const [pickedUser, setPickedUser] = useState('')
  const [pickedPermission, setPickedPermission] = useState<Permission>('view')
  const list = draft ?? shares.data ?? []
  const save = useMutation({
    mutationFn: (next: Share[]) =>
      apiFetch<Share[]>(`/api/bi/reports/${reportId}/shares`, { method: 'PUT', json: next.map(({ userId, permission }) => ({ userId, permission })) }),
    onSuccess: (saved) => {
      client.setQueryData(sharesKey(reportId), saved)
      onClose()
    },
  })
  const available = (users.data ?? []).filter((u) => u.id !== currentUserId && !list.some((s) => s.userId === u.id))
  const update = (userId: string, permission: Permission | null) =>
    setDraft(permission ? list.map((s) => (s.userId === userId ? { ...s, permission } : s)) : list.filter((s) => s.userId !== userId))

  function add() {
    const user = available.find((u) => u.id === pickedUser)
    if (!user) return
    setDraft([...list, { userId: user.id, userName: user.name, permission: pickedPermission }])
    setPickedUser('')
  }

  return (
    <ModalDialog title="Compartilhar relatório" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end gap-2">
          <select aria-label="Pessoa" value={pickedUser} onChange={(e) => setPickedUser(e.target.value)} className={`${SELECT} min-w-0 flex-1`}>
            <option value="">Escolha uma pessoa…</option>
            {available.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
          <PermissionSelect label="Permissão da nova pessoa" value={pickedPermission} onChange={setPickedPermission} />
          <Button variant="secondary" className="h-9" disabled={!pickedUser} onClick={add}>
            Adicionar
          </Button>
        </div>
        {shares.isLoading && <p className="text-sm text-muted">Carregando…</p>}
        <ul aria-label="Pessoas com acesso" className="flex flex-col divide-y divide-line border-y border-line">
          {list.map((share) => (
            <li key={share.userId} className="flex items-center gap-2 py-2">
              <span className="min-w-0 flex-1 truncate text-sm font-semibold">{share.userName}</span>
              <PermissionSelect label={`Permissão de ${share.userName}`} value={share.permission} onChange={(p) => update(share.userId, p)} />
              <button type="button" aria-label={`Remover ${share.userName}`} onClick={() => update(share.userId, null)} className="px-2 text-lg text-brand hover:bg-mist">
                ×
              </button>
            </li>
          ))}
          {list.length === 0 && !shares.isLoading && <li className="py-3 text-sm text-muted">Ainda não compartilhado com ninguém.</li>}
        </ul>
        {save.isError && (
          <p role="alert" className="text-sm text-brand">
            {save.error instanceof ApiError ? save.error.message : 'Não foi possível salvar.'}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={save.isPending || draft === null} onClick={() => save.mutate(list)}>
            Salvar
          </Button>
        </div>
      </div>
    </ModalDialog>
  )
}
