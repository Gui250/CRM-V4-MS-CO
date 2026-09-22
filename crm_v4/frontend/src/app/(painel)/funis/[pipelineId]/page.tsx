'use client'

import Link from 'next/link'
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useCallback, useMemo } from 'react'
import { Board } from '@/components/pipeline/board'
import { BoardFilters, type BoardFilterValue } from '@/components/pipeline/board-filters'
import { LeadPanel } from '@/components/pipeline/lead-panel'
import type { BoardFilter } from '@/lib/pipeline-cache'
import { useMe } from '@/lib/use-me'
import { useBoard, useLoadMoreLeads, usePipelines } from '@/lib/use-pipelines'

export default function PipelineBoardPage() {
  return (
    <Suspense>
      <PipelineBoard />
    </Suspense>
  )
}

function PipelineBoard() {
  const { pipelineId } = useParams<{ pipelineId: string }>()
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const { data: me } = useMe()
  const { data: pipelines } = usePipelines()

  const filterValue: BoardFilterValue = useMemo(() => ({ assignee: params.get('assignee') ?? '', search: params.get('q') ?? '' }), [params])
  // "me" is resolved here so cache keys and client-side matching use a real user id.
  const filter: BoardFilter = useMemo(
    () => ({ assignee: filterValue.assignee === 'me' ? (me?.id ?? '') : filterValue.assignee, search: filterValue.search }),
    [filterValue, me?.id],
  )
  const { data: board, isLoading, isError } = useBoard(pipelineId, filter)
  const loadMore = useLoadMoreLeads(pipelineId, filter)
  const openLeadId = params.get('lead')

  const setParams = useCallback(
    (changes: Record<string, string | null>) => {
      const next = new URLSearchParams(params)
      for (const [key, value] of Object.entries(changes)) {
        if (value) next.set(key, value)
        else next.delete(key)
      }
      const query = next.toString()
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
    },
    [params, pathname, router],
  )
  const openLead = useCallback((leadId: string) => setParams({ lead: leadId }), [setParams])
  const closeLead = useCallback(() => setParams({ lead: null }), [setParams])
  const changeFilter = useCallback((value: BoardFilterValue) => setParams({ assignee: value.assignee, q: value.search }), [setParams])

  return (
    <div className="flex h-full flex-col bg-paper">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-3 px-4 pt-5 pb-4 md:px-6">
        <div className="flex items-center gap-3">
          <Link href="/funis" className="text-sm font-semibold text-brand hover:underline">
            ← Funis
          </Link>
          <label htmlFor="pipeline-switcher" className="sr-only">
            Funil
          </label>
          <select
            id="pipeline-switcher"
            value={pipelineId}
            onChange={(e) => router.push(`/funis/${e.target.value}`)}
            className="bg-transparent font-display text-xl font-extrabold uppercase outline-none [font-stretch:115%]"
          >
            {(pipelines ?? (board ? [board.pipeline] : [])).map((pipeline) => (
              <option key={pipeline.id} value={pipeline.id}>
                {pipeline.name}
              </option>
            ))}
          </select>
        </div>
        <BoardFilters value={filterValue} onChange={changeFilter} />
        {me?.role === 'admin' && (
          <Link href={`/funis/${pipelineId}/etapas`} className="text-sm font-semibold text-ink hover:text-brand hover:underline lg:ml-auto">
            Editar etapas
          </Link>
        )}
      </header>

      <div className="min-h-0 flex-1">
        {isLoading && <p className="px-6 text-sm text-muted">Carregando quadro…</p>}
        {isError && <p className="px-6 text-sm text-brand">Não foi possível carregar este funil.</p>}
        {board && <Board board={board} filter={filter} onOpenLead={openLead} onLoadMore={loadMore} />}
      </div>
      {openLeadId && board && <LeadPanel key={openLeadId} leadId={openLeadId} stages={board.stages} onClose={closeLead} />}
    </div>
  )
}
