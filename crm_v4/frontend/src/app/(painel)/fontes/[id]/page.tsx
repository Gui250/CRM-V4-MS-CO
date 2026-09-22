'use client'

import { useParams } from 'next/navigation'
import { SourceForm } from '@/components/bi/source-form/source-form'
import { AdminOnly } from '@/components/bi/sources/admin-only'
import { SourceActions } from '@/components/bi/sources/source-actions'
import { SourceStatus } from '@/components/bi/sources/source-status'
import { useSourcePolling } from '@/components/bi/sources/use-source-admin'

function EditSource({ id }: { id: string }) {
  const { data: source, isLoading, isError } = useSourcePolling(id)
  if (isLoading) return <p className="text-sm text-muted">Carregando fonte…</p>
  if (isError || !source) return <p className="text-sm text-brand">Fonte de dados não encontrada.</p>
  if (source.kind === 'internal') return <p className="text-sm text-muted">Fontes do CRM são somente leitura.</p>
  return (
    <>
      <SourceStatus source={source} />
      <SourceActions source={source} />
      <SourceForm key={source.id} source={source} />
    </>
  )
}

export default function EditSourcePage() {
  const { id } = useParams<{ id: string }>()
  return (
    <AdminOnly title="Editar fonte">
      <EditSource id={id} />
    </AdminOnly>
  )
}
