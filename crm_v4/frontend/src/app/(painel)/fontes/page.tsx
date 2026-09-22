'use client'

import Link from 'next/link'
import { AdminOnly } from '@/components/bi/sources/admin-only'
import { RelationshipsPanel } from '@/components/bi/sources/relationships-panel'
import { SourcesList } from '@/components/bi/sources/sources-list'

export default function SourcesPage() {
  return (
    <AdminOnly title="Fontes de dados" description="Conecte planilhas, bancos e APIs para usar nos relatórios.">
      <Link href="/fontes/nova" className="inline-flex h-10 items-center self-start bg-brand px-4 text-sm font-semibold tracking-wide text-white hover:bg-brand-dark">
        Nova fonte
      </Link>
      <SourcesList />
      <RelationshipsPanel />
    </AdminOnly>
  )
}
