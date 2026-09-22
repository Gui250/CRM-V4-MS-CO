'use client'

import { AutomationSubnav } from '@/components/automation/automation-subnav'
import { AdminOnly, PageTitle } from '@/components/automation/error-alert'
import { FlowList } from '@/components/automation/flow-list'
import { useMe } from '@/lib/use-me'

export default function AutomationsPage() {
  const { data: me } = useMe()
  if (!me) return null
  if (me.role !== 'admin') return <AdminOnly>Apenas administradores gerenciam automações.</AdminOnly>
  return (
    <div className="mx-auto max-w-5xl px-5 py-8 md:px-10 md:py-12">
      <PageTitle title="Automações" subtitle="Monte fluxos que respondem sozinhos e escolha a ordem em que rodam." />
      <AutomationSubnav />
      <FlowList />
    </div>
  )
}
