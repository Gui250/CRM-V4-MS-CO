'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { ApiError, apiFetch } from '@/lib/api'
import { type Handling, isAwaitingHuman } from '@/lib/automation-types'

type Action = 'assume' | 'release' | 'opt-out' | 'opt-in'

function request(action: Action, conversationId: string, contactId: string) {
  if (action === 'assume' || action === 'release') return apiFetch(`/api/conversations/${conversationId}/${action}`, { method: 'POST' })
  return apiFetch(`/api/contacts/${contactId}/automation-opt-out`, { method: action === 'opt-out' ? 'PUT' : 'DELETE' })
}

function useHandlingAction(conversationId: string, contactId: string) {
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const mutation = useMutation({
    mutationFn: (action: Action) => request(action, conversationId, contactId),
    onMutate: () => setError(null),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ['conversations'] }),
        queryClient.invalidateQueries({ queryKey: ['messages', conversationId] }),
      ]),
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Não foi possível salvar. Tente novamente.'),
  })
  return { ...mutation, error }
}

function HumanStatus({ handling }: { handling: Handling }) {
  const [showSummary, setShowSummary] = useState(false)
  return (
    <div className="flex flex-col gap-1">
      <p className="text-sm font-semibold">{isAwaitingHuman(handling) ? 'Aguardando humano' : `Assumida por ${handling.assumedBy?.name}`}</p>
      {handling.reason && <p className="text-sm text-muted">Motivo: {handling.reason}</p>}
      {handling.summary && (
        <>
          <button type="button" onClick={() => setShowSummary(!showSummary)} aria-expanded={showSummary} className="self-start text-xs font-semibold text-brand">
            {showSummary ? 'Ocultar resumo' : 'Ver resumo'}
          </button>
          {showSummary && <p className="whitespace-pre-line bg-paper px-3 py-2 text-sm">{handling.summary}</p>}
        </>
      )}
    </div>
  )
}

export function HandoffBanner({
  conversationId,
  contactId,
  handling,
  automationOptOut,
}: {
  conversationId: string
  contactId: string
  handling: Handling
  automationOptOut: boolean
}) {
  const action = useHandlingAction(conversationId, contactId)
  const isHuman = handling.mode === 'human'
  if (!isHuman && !automationOptOut) return null

  return (
    <section aria-label="Atendimento" className="flex flex-col gap-3 border-b border-line border-l-4 border-l-brand bg-mist px-4 py-3">
      {isHuman && <HumanStatus handling={handling} />}
      {action.error && (
        <p role="alert" className="text-sm text-brand">
          {action.error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {isAwaitingHuman(handling) && <Button onClick={() => action.mutate('assume')} disabled={action.isPending}>Assumir</Button>}
        {isHuman && (
          <Button variant="secondary" onClick={() => action.mutate('release')} disabled={action.isPending}>
            Devolver para automação
          </Button>
        )}
        <label className="ml-auto flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={automationOptOut}
            disabled={action.isPending}
            onChange={(e) => action.mutate(e.target.checked ? 'opt-out' : 'opt-in')}
            className="accent-brand"
          />
          Não automatizar este contato
        </label>
      </div>
    </section>
  )
}
