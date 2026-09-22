'use client'

import { AutomationSubnav } from '@/components/automation/automation-subnav'
import { AdminOnly, PageTitle } from '@/components/automation/error-alert'
import { ProviderManager } from '@/components/automation/provider-form'
import { useMe } from '@/lib/use-me'

export default function ProvidersPage() {
  const { data: me } = useMe()
  if (!me) return null
  if (me.role !== 'admin') return <AdminOnly>Apenas administradores gerenciam provedores de IA.</AdminOnly>
  return (
    <div className="mx-auto max-w-3xl px-5 py-8 md:px-10 md:py-12">
      <PageTitle title="Provedores de IA" subtitle="Cadastre as chaves usadas pelos agentes. A chave é testada antes de salvar e nunca é mostrada de novo." />
      <AutomationSubnav />
      <ProviderManager />
    </div>
  )
}
