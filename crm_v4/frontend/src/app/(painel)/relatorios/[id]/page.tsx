'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ReportEditor } from '@/components/bi/report-editor'
import { ReportView } from '@/components/bi/report-view'
import { useIsDesktop } from '@/components/bi/use-is-desktop'
import { useReport } from '@/lib/bi/use-bi'
import { useMe } from '@/lib/use-me'

/** `view` permission, or a screen below `md`, gets the read-only viewer; owners/editors get the editor. */
export default function ReportPage() {
  const { id } = useParams<{ id: string }>()
  const report = useReport(id)
  const { data: me } = useMe()
  const isDesktop = useIsDesktop()

  if (report.isError) {
    return (
      <div className="grid h-full place-items-center p-6 text-center">
        <div className="flex flex-col gap-2">
          <p className="font-display text-lg font-extrabold uppercase">Relatório indisponível</p>
          <p className="text-sm text-muted">Ele foi excluído ou não foi compartilhado com você.</p>
          <Link href="/relatorios" className="text-sm font-semibold text-brand hover:underline">
            Voltar aos relatórios
          </Link>
        </div>
      </div>
    )
  }
  if (!report.data) {
    return (
      <div className="grid h-full place-items-center" aria-busy="true">
        <span className="size-3 animate-pulse bg-brand" aria-label="Carregando relatório" />
      </div>
    )
  }
  const { permission } = report.data
  if (permission === 'view' || !isDesktop) return <ReportView reportName={report.data.name} definition={report.data.definition} />
  return <ReportEditor key={id} report={report.data} canShare={permission === 'owner' || me?.role === 'admin'} currentUserId={me?.id} />
}
