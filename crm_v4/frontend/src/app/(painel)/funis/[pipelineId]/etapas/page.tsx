'use client'

import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { StageEditor } from '@/components/pipeline/stage-editor'
import { useMe } from '@/lib/use-me'
import { usePipelines } from '@/lib/use-pipelines'

export default function StagesPage() {
  const { pipelineId } = useParams<{ pipelineId: string }>()
  const router = useRouter()
  const { data: me } = useMe()
  const { data: pipelines, isLoading } = usePipelines()
  const pipeline = pipelines?.find((p) => p.id === pipelineId)
  const isAdmin = me?.role === 'admin'

  useEffect(() => {
    if (me && !isAdmin) router.replace(`/funis/${pipelineId}`)
  }, [me, isAdmin, pipelineId, router])

  if (!isAdmin) return null
  return (
    <div className="h-full overflow-y-auto bg-mist">
      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6 md:px-8 md:py-10">
        <header className="flex flex-col gap-1">
          <Link href={`/funis/${pipelineId}`} className="text-sm font-semibold text-brand hover:underline">
            ← Voltar ao quadro
          </Link>
          <h1 className="font-display text-2xl font-extrabold uppercase [font-stretch:115%]">Etapas · {pipeline?.name ?? '…'}</h1>
          <p className="text-sm text-muted">Arraste para reordenar. As mudanças aparecem no quadro de todos na hora.</p>
        </header>
        {isLoading && <p className="text-sm text-muted">Carregando…</p>}
        {!isLoading && !pipeline && <p className="text-sm text-brand">Funil não encontrado.</p>}
        {pipeline && <StageEditor pipeline={pipeline} />}
      </div>
    </div>
  )
}
