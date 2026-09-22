'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { ReportNameDialog } from '@/components/bi/report-name-dialog'
import { formatDateTime } from '@/components/bi/sources/labels'
import { Menu } from '@/components/bi/menu'
import { Button } from '@/components/ui/button'
import { ApiError } from '@/lib/api'
import type { ReportPermission, ReportSummary } from '@/lib/bi/types'
import { useCreateReport, useDeleteReport, useReports } from '@/lib/bi/use-bi'
import { useMe } from '@/lib/use-me'

const PERMISSION_LABELS: Record<ReportPermission, string> = { owner: 'Dono', edit: 'Pode editar', view: 'Só visualizar' }

const errorText = (error: unknown) => (error instanceof ApiError ? error.message : 'Algo deu errado. Tente novamente.')

type Dialog = { kind: 'new' } | { kind: 'duplicate'; report: ReportSummary } | null

function ReportRow({ report, canDelete, onDuplicate, onDelete }: { report: ReportSummary; canDelete: boolean; onDuplicate: () => void; onDelete: () => void }) {
  return (
    <li className="flex items-center gap-4 bg-paper px-4 py-3 hover:bg-paper/70">
      <div className="min-w-0 flex-1">
        <Link href={`/relatorios/${report.id}`} className="block truncate font-display text-base font-extrabold uppercase [font-stretch:112%] hover:text-brand">
          {report.name}
        </Link>
        <p className="font-mono text-[11px] text-muted">
          {report.ownerName} · atualizado em {formatDateTime(report.updatedAt)}
        </p>
      </div>
      <span className={`px-2 py-0.5 font-mono text-[10px] font-bold tracking-wider uppercase ${report.permission === 'owner' ? 'bg-brand text-white' : 'bg-mist text-ink'}`}>
        {PERMISSION_LABELS[report.permission]}
      </span>
      <Menu
        label={`Ações de ${report.name}`}
        className="grid size-8 place-items-center text-lg hover:bg-mist"
        items={[{ label: 'Duplicar', onSelect: onDuplicate }, ...(canDelete ? [{ label: 'Excluir', onSelect: onDelete }] : [])]}
      >
        <span aria-hidden>⋯</span>
      </Menu>
    </li>
  )
}

function Section({ title, reports, empty, ...actions }: { title: string; reports: ReportSummary[]; empty: string; canDelete: (r: ReportSummary) => boolean; onDuplicate: (r: ReportSummary) => void; onDelete: (r: ReportSummary) => void }) {
  return (
    <section aria-labelledby={`section-${title}`} className="flex flex-col gap-2">
      <h2 id={`section-${title}`} className="font-mono text-xs font-bold tracking-widest text-muted uppercase">
        {title}
      </h2>
      {reports.length === 0 ? (
        <p className="text-sm text-muted">{empty}</p>
      ) : (
        <ul aria-label={title} className="flex flex-col gap-px bg-line">
          {reports.map((r) => (
            <ReportRow key={r.id} report={r} canDelete={actions.canDelete(r)} onDuplicate={() => actions.onDuplicate(r)} onDelete={() => actions.onDelete(r)} />
          ))}
        </ul>
      )}
    </section>
  )
}

export default function ReportsPage() {
  const router = useRouter()
  const { data: me } = useMe()
  const reports = useReports()
  const create = useCreateReport()
  const remove = useDeleteReport()
  const [dialog, setDialog] = useState<Dialog>(null)
  const mine = reports.data?.filter((r) => r.permission === 'owner') ?? []
  const shared = reports.data?.filter((r) => r.permission !== 'owner') ?? []

  const close = () => {
    create.reset()
    setDialog(null)
  }
  const submit = (name: string, template: string) =>
    create.mutate(
      dialog?.kind === 'duplicate' ? { name, duplicateOf: dialog.report.id } : { name, ...(template === 'whatsapp_attendance' ? { templateId: template } : {}) },
      { onSuccess: (report) => router.push(`/relatorios/${report.id}`) },
    )
  const actions = {
    canDelete: (r: ReportSummary) => r.permission === 'owner' || me?.role === 'admin',
    onDuplicate: (r: ReportSummary) => setDialog({ kind: 'duplicate', report: r }),
    onDelete: (r: ReportSummary) => window.confirm(`Excluir o relatório "${r.name}"? Essa ação não pode ser desfeita.`) && remove.mutate(r.id),
  }

  return (
    <div className="h-full overflow-y-auto bg-mist">
      <div className="mx-auto flex max-w-4xl flex-col gap-8 px-4 py-6 md:px-8 md:py-10">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-extrabold uppercase [font-stretch:115%]">Relatórios</h1>
            <p className="text-sm text-muted">Monte painéis arrastando componentes sobre os dados do CRM.</p>
          </div>
          <Button onClick={() => setDialog({ kind: 'new' })} className="cut-corner [--cut:10px]">
            Novo relatório
          </Button>
        </header>
        {reports.isLoading && <p className="text-sm text-muted">Carregando relatórios…</p>}
        {reports.isError && <p className="text-sm text-brand">Não foi possível carregar os relatórios.</p>}
        {remove.isError && (
          <p role="alert" className="bg-brand px-3 py-2 text-sm font-semibold text-white">
            {errorText(remove.error)}
          </p>
        )}
        {reports.data && (
          <>
            <Section title="Meus relatórios" reports={mine} empty="Você ainda não criou relatórios." {...actions} />
            <Section title="Compartilhados comigo" reports={shared} empty="Nenhum relatório compartilhado com você." {...actions} />
          </>
        )}
      </div>
      {dialog && (
        <ReportNameDialog
          title={dialog.kind === 'new' ? 'Novo relatório' : 'Duplicar relatório'}
          initialName={dialog.kind === 'duplicate' ? `${dialog.report.name} (cópia)` : ''}
          submitLabel={dialog.kind === 'new' ? 'Criar' : 'Duplicar'}
          withTemplate={dialog.kind === 'new'}
          error={create.isError ? errorText(create.error) : null}
          isPending={create.isPending}
          onSubmit={submit}
          onClose={close}
        />
      )}
    </div>
  )
}
