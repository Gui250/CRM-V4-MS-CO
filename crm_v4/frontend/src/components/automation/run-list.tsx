'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { isRunActive, type RunStatus, type RunSummary } from '@/lib/automation-types'
import { formatPhone } from '@/lib/format'
import { useFlowRuns } from '@/lib/use-automation'
import { formatDateTime } from './error-alert'

export const RUN_STATUS_LABELS: Record<RunStatus, string> = {
  running: 'Em andamento',
  waiting: 'Aguardando',
  completed: 'Concluída',
  failed: 'Falhou',
  cancelled: 'Interrompida',
}

/** "850 ms", "12 s", "3 min 5 s", "2 h 10 min". */
export function formatDuration(ms: number) {
  if (ms < 1_000) return `${ms} ms`
  const seconds = Math.round(ms / 1_000)
  if (seconds < 60) return `${seconds} s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} min ${seconds % 60} s`
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`
}

const durationOf = (run: RunSummary) =>
  isRunActive(run) || !run.finishedAt ? '—' : formatDuration(new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime())

export function RunList({ flowId }: { flowId: string }) {
  const [status, setStatus] = useState<RunStatus | ''>('')
  const { data, isLoading, hasNextPage, fetchNextPage, isFetchingNextPage } = useFlowRuns(flowId, status || undefined)
  const runs = data?.pages.flatMap((page) => page.items) ?? []

  return (
    <div className="flex flex-col gap-5">
      <label className="flex flex-col gap-1.5 self-start text-xs font-semibold uppercase tracking-[0.12em]">
        Situação
        <select value={status} onChange={(e) => setStatus(e.target.value as RunStatus | '')} className="h-11 border-b-2 border-ink/20 bg-mist px-3 text-base normal-case tracking-normal">
          <option value="">Todas</option>
          {Object.entries(RUN_STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      {isLoading ? (
        <p className="text-sm text-muted">Carregando…</p>
      ) : runs.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted">Nenhuma execução encontrada.</p>
      ) : (
        <ul className="divide-y divide-line border-y border-line">
          {runs.map((run) => (
            <RunRow key={run.id} run={run} />
          ))}
        </ul>
      )}
      {hasNextPage && (
        <Button variant="secondary" className="self-center" disabled={isFetchingNextPage} onClick={() => void fetchNextPage()}>
          Carregar mais
        </Button>
      )}
    </div>
  )
}

function RunRow({ run }: { run: RunSummary }) {
  return (
    <li>
      <Link href={`/automacoes/execucoes/${run.id}`} className="grid gap-1 py-3 hover:bg-mist sm:grid-cols-[10rem_1fr_10rem_6rem] sm:items-center sm:gap-4 sm:px-2">
        <span className="flex items-center gap-2 text-sm font-semibold">
          <span className={run.status === 'failed' ? 'text-brand' : undefined}>{RUN_STATUS_LABELS[run.status]}</span>
          {run.isTest && <Badge tone="neutral">teste</Badge>}
        </span>
        <span className="truncate text-sm">{run.contact.name ?? formatPhone(run.contact.phone)}</span>
        <span className="font-mono text-xs text-muted">{formatDateTime(run.startedAt)}</span>
        <span className="font-mono text-xs text-muted">{durationOf(run)}</span>
      </Link>
    </li>
  )
}
