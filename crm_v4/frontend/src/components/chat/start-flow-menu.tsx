'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { ApiError } from '@/lib/api'
import type { FlowSummary } from '@/lib/automation-types'
import { useStartableFlows, useStartFlow } from '@/lib/use-automation'

const errorMessage = (err: unknown) => (err instanceof ApiError ? err.message : 'Não foi possível disparar o fluxo.')

function FlowOptions({ onPick }: { onPick: (flow: FlowSummary) => void }) {
  const { data: flows = [], isLoading } = useStartableFlows()
  if (isLoading) return <p className="px-3 py-2 text-sm text-muted">Carregando…</p>
  if (flows.length === 0) return <p className="px-3 py-2 text-sm text-muted">Nenhum fluxo ativo.</p>
  return (
    <ul role="menu">
      {flows.map((flow) => (
        <li key={flow.id} role="none">
          <button type="button" role="menuitem" onClick={() => onPick(flow)} className="flex w-full flex-col items-start px-3 py-2 text-left hover:bg-mist">
            <span className="text-sm font-semibold">{flow.name}</span>
            {flow.description && <span className="text-xs text-muted">{flow.description}</span>}
          </button>
        </li>
      ))}
    </ul>
  )
}

export function StartFlowMenu({ conversationId, disabled }: { conversationId: string; disabled?: boolean }) {
  const [open, setOpen] = useState(false)
  const [picked, setPicked] = useState<FlowSummary | null>(null)
  const start = useStartFlow()

  function close() {
    setOpen(false)
    setPicked(null)
    start.reset()
  }

  return (
    <div className="relative">
      <Button variant="secondary" aria-expanded={open} onClick={() => (open ? close() : setOpen(true))} disabled={disabled}>
        Automações
      </Button>
      {open && (
        <div className="absolute right-0 z-10 mt-1 w-72 border border-line bg-paper shadow-lg">
          {picked ? (
            <div className="flex flex-col gap-3 p-3">
              <p className="text-sm">Disparar {picked.name}?</p>
              {start.error && (
                <p role="alert" className="text-sm text-brand">
                  {errorMessage(start.error)}
                </p>
              )}
              <div className="flex gap-2">
                <Button onClick={() => start.mutate({ conversationId, flowId: picked.id }, { onSuccess: close })} disabled={start.isPending}>
                  Confirmar
                </Button>
                <Button variant="ghost" onClick={close}>
                  Cancelar
                </Button>
              </div>
            </div>
          ) : (
            <FlowOptions onPick={setPicked} />
          )}
        </div>
      )}
    </div>
  )
}
