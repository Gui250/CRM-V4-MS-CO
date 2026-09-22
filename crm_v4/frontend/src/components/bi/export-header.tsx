import { formatDateTime } from './sources/labels'

/** Hidden on screen; printed and captured in PNG (print.css) so exports carry context (FR-033). */
export function ExportHeader({ reportName, pageName, filters, generatedAt }: { reportName: string; pageName: string; filters: string[]; generatedAt: Date }) {
  return (
    <header className="bi-export-header hidden border-b-2 border-brand pb-2 mb-3">
      <p className="font-display text-xl font-extrabold uppercase [font-stretch:115%]">{reportName}</p>
      <p className="text-sm font-semibold">{pageName}</p>
      <p className="text-xs">Filtros: {filters.length ? filters.join(' · ') : 'nenhum'}</p>
      <p className="font-mono text-[11px] text-muted">Gerado em {formatDateTime(generatedAt.toISOString())}</p>
    </header>
  )
}
