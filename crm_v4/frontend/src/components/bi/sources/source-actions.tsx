'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type { Source } from '@/lib/bi/types'
import { errorText, useDeleteSource, useRefreshSource } from './use-source-admin'

/** "Atualizar agora" and "Excluir fonte" (with inline confirmation) for the edit page. */
export function SourceActions({ source }: { source: Source }) {
  const router = useRouter()
  const refresh = useRefreshSource()
  const remove = useDeleteSource(source.id)
  const [confirming, setConfirming] = useState(false)
  const error = refresh.error ?? remove.error

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" disabled={source.isRefreshing || refresh.isPending} onClick={() => refresh.mutate(source.id)}>
          {source.isRefreshing ? 'Atualizando…' : 'Atualizar agora'}
        </Button>
        {confirming ? (
          <>
            <span className="text-sm font-semibold">Excluir &quot;{source.name}&quot;?</span>
            <Button variant="danger" disabled={remove.isPending} onClick={() => remove.mutate(undefined, { onSuccess: () => router.push('/fontes') })}>
              Confirmar exclusão
            </Button>
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              Cancelar
            </Button>
          </>
        ) : (
          <Button variant="danger" onClick={() => setConfirming(true)}>
            Excluir fonte
          </Button>
        )}
      </div>
      {error && (
        <p role="alert" className="border-l-4 border-brand bg-brand/5 px-3 py-2 text-sm">
          {errorText(error)}
        </p>
      )}
    </div>
  )
}
