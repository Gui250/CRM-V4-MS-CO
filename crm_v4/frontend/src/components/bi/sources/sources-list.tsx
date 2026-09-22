'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { KIND_LABELS } from './labels'
import { SourceStatus } from './source-status'
import { errorText, useRefreshSource, useSourcesPolling } from './use-source-admin'

export function SourcesList() {
  const { data: sources = [], isLoading, isError } = useSourcesPolling()
  const refresh = useRefreshSource()
  const external = sources.filter((source) => source.kind !== 'internal')
  const internal = sources.filter((source) => source.kind === 'internal')

  if (isLoading) return <p className="text-sm text-muted">Carregando fontes…</p>
  if (isError) return <p className="text-sm text-brand">Não foi possível carregar as fontes.</p>

  return (
    <div className="flex flex-col gap-10">
      <section aria-labelledby="external-title" className="flex flex-col gap-3">
        <h2 id="external-title" className="font-display text-lg font-extrabold uppercase [font-stretch:112%]">
          Fontes externas
        </h2>
        {refresh.isError && (
          <p role="alert" className="border-l-4 border-brand bg-brand/5 px-3 py-2 text-sm">
            {errorText(refresh.error)}
          </p>
        )}
        {external.length === 0 ? (
          <p className="text-sm text-muted">Nenhuma fonte externa ainda. Conecte uma planilha, um banco ou uma API.</p>
        ) : (
          <ul aria-label="Fontes externas" className="flex flex-col gap-3">
            {external.map((source) => (
              <li key={source.id} className="flex flex-col gap-3 bg-paper p-5 cut-corner [--cut:16px] sm:flex-row sm:items-start sm:justify-between">
                <div className="flex min-w-0 flex-col gap-1.5">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="font-display text-lg font-extrabold uppercase [font-stretch:112%]">{source.name}</span>
                    <span className="bg-mist px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider">{KIND_LABELS[source.kind]}</span>
                  </p>
                  <SourceStatus source={source} />
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button
                    variant="secondary"
                    className="h-9"
                    aria-label={`Atualizar agora ${source.name}`}
                    disabled={source.isRefreshing || (refresh.isPending && refresh.variables === source.id)}
                    onClick={() => refresh.mutate(source.id)}
                  >
                    Atualizar agora
                  </Button>
                  <Link
                    href={`/fontes/${source.id}`}
                    aria-label={`Editar ${source.name}`}
                    className="inline-flex h-9 items-center px-4 text-sm font-semibold hover:bg-mist"
                  >
                    Editar
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="internal-title" className="flex flex-col gap-3">
        <h2 id="internal-title" className="font-display text-lg font-extrabold uppercase [font-stretch:112%]">
          Dados do CRM
        </h2>
        <p className="text-sm text-muted">Fontes internas, sempre atualizadas e somente leitura.</p>
        <ul aria-label="Dados do CRM" className="divide-y divide-line border-y border-line">
          {internal.map((source) => (
            <li key={source.id} className="flex flex-wrap items-baseline justify-between gap-2 py-3">
              <span className="font-semibold">{source.name}</span>
              <span className="font-mono text-xs text-muted">{source.fields.length} campos</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
