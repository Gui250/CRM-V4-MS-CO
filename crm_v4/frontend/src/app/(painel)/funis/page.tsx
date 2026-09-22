'use client'

import Link from 'next/link'
import { useState } from 'react'
import { STAGE_COLOR_CLASSES } from '@/components/pipeline/stage-colors'
import { Button } from '@/components/ui/button'
import { ApiError } from '@/lib/api'
import type { Pipeline } from '@/lib/types'
import { useMe } from '@/lib/use-me'
import { useCreatePipeline, usePipelines, useUpdatePipeline } from '@/lib/use-pipelines'

const PIPELINE_NAME_MAX = 60

const errorText = (error: unknown) => (error instanceof ApiError ? error.message : 'Algo deu errado. Tente novamente.')

function NewPipelineForm({ onError }: { onError: (message: string | null) => void }) {
  const createPipeline = useCreatePipeline()
  const [name, setName] = useState('')
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        onError(null)
        createPipeline.mutate(name.trim(), { onSuccess: () => setName(''), onError: (error) => onError(errorText(error)) })
      }}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <label htmlFor="new-pipeline" className="text-xs font-semibold uppercase tracking-[0.12em]">
          Novo funil
        </label>
        <input
          id="new-pipeline"
          value={name}
          maxLength={PIPELINE_NAME_MAX}
          placeholder="Ex.: Pós-venda"
          onChange={(e) => setName(e.target.value)}
          className="h-11 border-b-2 border-ink/20 bg-paper px-3 outline-none focus:border-brand"
        />
      </div>
      <Button type="submit" disabled={!name.trim() || createPipeline.isPending}>
        Criar funil
      </Button>
    </form>
  )
}

function AdminActions({ pipeline, onError }: { pipeline: Pipeline; onError: (message: string | null) => void }) {
  const updatePipeline = useUpdatePipeline()
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState(pipeline.name)
  const update = (changes: { name?: string; isEntry?: boolean; archived?: boolean }, onSuccess?: () => void) => {
    onError(null)
    updatePipeline.mutate({ pipelineId: pipeline.id, ...changes }, { onSuccess, onError: (error) => onError(errorText(error)) })
  }

  if (pipeline.archivedAt) {
    return (
      <Button variant="secondary" className="h-8" onClick={() => update({ archived: false })}>
        Reativar
      </Button>
    )
  }
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
      {renaming ? (
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            update({ name: name.trim() }, () => setRenaming(false))
          }}
        >
          <label className="sr-only" htmlFor={`rename-${pipeline.id}`}>
            Novo nome de {pipeline.name}
          </label>
          <input
            id={`rename-${pipeline.id}`}
            value={name}
            maxLength={PIPELINE_NAME_MAX}
            onChange={(e) => setName(e.target.value)}
            className="h-8 border-b-2 border-brand bg-mist px-2 outline-none"
          />
          <Button type="submit" className="h-8" disabled={!name.trim()}>
            Salvar
          </Button>
        </form>
      ) : (
        <button onClick={() => setRenaming(true)} className="font-semibold hover:underline">
          Renomear
        </button>
      )}
      <label className="flex items-center gap-1.5 font-semibold">
        <input type="checkbox" checked={pipeline.isEntry} onChange={(e) => update({ isEntry: e.target.checked })} className="accent-brand" />
        Funil de entrada
      </label>
      <Link href={`/funis/${pipeline.id}/etapas`} className="font-semibold hover:underline">
        Editar etapas
      </Link>
      <button onClick={() => update({ archived: true })} className="font-semibold text-brand hover:underline">
        Arquivar
      </button>
    </div>
  )
}

function PipelineCard({ pipeline, isAdmin, onError }: { pipeline: Pipeline; isAdmin: boolean; onError: (message: string | null) => void }) {
  const archived = Boolean(pipeline.archivedAt)
  return (
    <li className={`flex flex-col bg-paper cut-corner [--cut:16px] ${archived ? 'opacity-80' : ''}`}>
      <Link href={archived ? '#' : `/funis/${pipeline.id}`} aria-disabled={archived} className="group flex flex-col gap-4 p-5 hover:bg-ink hover:text-white">
        <span className="flex items-start justify-between gap-2">
          <span className="font-display text-lg font-extrabold uppercase [font-stretch:112%]">{pipeline.name}</span>
          {pipeline.isEntry && <span className="bg-brand px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-white">Entrada</span>}
          {archived && <span className="bg-mist px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-ink">Arquivado</span>}
        </span>
        <span aria-label={`${pipeline.stages.length} etapas`} className="flex gap-1">
          {pipeline.stages.map((stage) => (
            <span key={stage.id} title={stage.name} className={`h-1.5 flex-1 ${STAGE_COLOR_CLASSES[stage.color].chip}`} />
          ))}
        </span>
        <span className="font-mono text-xs text-muted group-hover:text-white/70">{pipeline.stages.map((stage) => stage.name).join(' → ')}</span>
      </Link>
      {isAdmin && (
        <div className="border-t border-line px-5 py-3">
          <AdminActions pipeline={pipeline} onError={onError} />
        </div>
      )}
    </li>
  )
}

export default function PipelinesPage() {
  const { data: me } = useMe()
  const isAdmin = me?.role === 'admin'
  const [showArchived, setShowArchived] = useState(false)
  const { data: pipelines, isLoading, isError } = usePipelines(isAdmin && showArchived)
  const [error, setError] = useState<string | null>(null)

  return (
    <div className="h-full overflow-y-auto bg-mist">
      <div className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-6 md:px-8 md:py-10">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-extrabold uppercase [font-stretch:115%]">Funis</h1>
            <p className="text-sm text-muted">Escolha um funil para ver e mover os leads.</p>
          </div>
          {isAdmin && (
            <label className="flex items-center gap-1.5 text-sm font-semibold">
              <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} className="accent-brand" />
              Mostrar arquivados
            </label>
          )}
        </header>

        {isAdmin && <NewPipelineForm onError={setError} />}
        {error && (
          <p role="alert" className="bg-brand px-3 py-2 text-sm font-semibold text-white">
            {error}
          </p>
        )}
        {isLoading && <p className="text-sm text-muted">Carregando funis…</p>}
        {isError && <p className="text-sm text-brand">Não foi possível carregar os funis.</p>}

        <ul aria-label="Funis" className="grid gap-3 sm:grid-cols-2">
          {pipelines?.map((pipeline) => (
            <PipelineCard key={pipeline.id} pipeline={pipeline} isAdmin={isAdmin} onError={setError} />
          ))}
        </ul>
      </div>
    </div>
  )
}
