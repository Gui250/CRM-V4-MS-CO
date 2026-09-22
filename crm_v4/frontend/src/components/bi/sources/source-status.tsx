import type { Source } from '@/lib/bi/types'
import { formatDateTime, INTERVAL_LABELS } from './labels'

/** Freshness line of an external source: rows, last refresh, schedule, running/error state. */
export function SourceStatus({ source }: { source: Source }) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="font-mono text-xs text-muted">
        {source.rowCount != null ? `${source.rowCount.toLocaleString('pt-BR')} linhas` : 'Sem dados ainda'}
        {' · '}
        {source.lastRefreshedAt ? `Atualizado em ${formatDateTime(source.lastRefreshedAt)}` : 'Nunca atualizado'}
        {' · '}
        {INTERVAL_LABELS[source.refreshInterval]}
      </p>
      {source.isRefreshing && (
        <p role="status" className="text-xs font-semibold">
          Atualizando…
        </p>
      )}
      {source.lastError && (
        <p className="flex items-start gap-2 text-sm">
          <span className="shrink-0 bg-brand px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-white">Erro</span>
          <span>{source.lastError}</span>
        </p>
      )}
    </div>
  )
}
