'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { AdminOnly, PageTitle } from '@/components/automation/error-alert'
import { RunList } from '@/components/automation/run-list'
import { useFlow } from '@/lib/use-automation'
import { useMe } from '@/lib/use-me'

export default function FlowRunsPage() {
  const { id } = useParams<{ id: string }>()
  const { data: me } = useMe()
  const { data: flow } = useFlow(id)
  if (!me) return null
  if (me.role !== 'admin') return <AdminOnly>Apenas administradores veem o histórico de execuções.</AdminOnly>
  return (
    <div className="mx-auto max-w-5xl px-5 py-8 md:px-10 md:py-12">
      <Link href="/automacoes" className="mb-6 inline-block text-sm font-semibold underline">
        ← Automações
      </Link>
      <PageTitle title="Execuções" subtitle={flow ? `Histórico do fluxo “${flow.name}”, mais recentes primeiro.` : 'Histórico do fluxo, mais recentes primeiro.'} />
      <RunList flowId={id} />
    </div>
  )
}
