'use client'

import { AgentManager } from '@/components/automation/agent-list'
import { AutomationSubnav } from '@/components/automation/automation-subnav'
import { AdminOnly, PageTitle } from '@/components/automation/error-alert'
import { useMe } from '@/lib/use-me'

export default function AgentsPage() {
  const { data: me } = useMe()
  if (!me) return null
  if (me.role !== 'admin') return <AdminOnly>Apenas administradores gerenciam agentes de IA.</AdminOnly>
  return (
    <div className="mx-auto max-w-3xl px-5 py-8 md:px-10 md:py-12">
      <PageTitle title="Agentes de IA" subtitle="Configure quem responde pelos fluxos e ative ou desative a qualquer momento." />
      <AutomationSubnav />
      <AgentManager />
    </div>
  )
}
