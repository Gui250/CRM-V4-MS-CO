'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { AdminOnly } from '@/components/automation/error-alert'
import { FlowEditor } from '@/components/automation/flow-editor'
import { LG_WIDTH, useIsDesktop } from '@/components/bi/use-is-desktop'
import { useFlow } from '@/lib/use-automation'
import { useMe } from '@/lib/use-me'

/** Admins edit from `lg` up; below that the flow is read-only (spec 003 Assumptions). */
export default function FlowEditorPage() {
  const { id } = useParams<{ id: string }>()
  const { data: me } = useMe()
  const flow = useFlow(id)
  const isDesktop = useIsDesktop(LG_WIDTH)

  if (!me) return null
  if (me.role !== 'admin') return <AdminOnly>Apenas administradores editam fluxos.</AdminOnly>
  if (flow.isError) {
    return (
      <div className="grid h-full place-items-center p-6 text-center">
        <div className="flex flex-col gap-2">
          <p className="font-display text-lg font-extrabold uppercase">Fluxo não encontrado</p>
          <p className="text-sm text-muted">Ele foi excluído ou o endereço está errado.</p>
          <Link href="/automacoes" className="text-sm font-semibold text-brand hover:underline">
            Voltar às automações
          </Link>
        </div>
      </div>
    )
  }
  if (!flow.data) {
    return (
      <div className="grid h-full place-items-center" aria-busy="true">
        <span className="size-3 animate-pulse bg-brand" aria-label="Carregando fluxo" />
      </div>
    )
  }
  return <FlowEditor key={id} flow={flow.data} readOnly={!isDesktop} />
}
