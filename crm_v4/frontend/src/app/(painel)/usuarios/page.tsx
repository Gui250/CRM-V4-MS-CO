'use client'

import { UsersTable } from '@/components/users/users-table'
import { useMe } from '@/lib/use-me'

export default function UsersPage() {
  const { data: me } = useMe()
  if (!me) return null
  if (me.role !== 'admin') {
    return <p className="p-8 text-sm text-muted">Apenas administradores gerenciam usuários.</p>
  }
  return (
    <div className="mx-auto max-w-3xl px-5 py-8 md:px-10 md:py-12">
      <h1 className="font-display text-3xl font-extrabold uppercase [font-stretch:115%]">Usuários</h1>
      <p className="mt-2 mb-8 text-sm text-muted">Aprove novos cadastros e controle quem acessa o painel.</p>
      <UsersTable currentUserId={me.id} />
    </div>
  )
}
