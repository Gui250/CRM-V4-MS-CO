'use client'

import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { AiAgent } from '@/lib/automation-types'
import { useAiAgents, useDeleteAiAgent, useUpdateAiAgent } from '@/lib/use-automation'
import { AgentForm } from './agent-form'
import { ErrorAlert, errorMessage } from './error-alert'

type OnError = (message: string | null) => void

export function AgentManager() {
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const { data: agents = [], isLoading } = useAiAgents()
  return (
    <div className="flex flex-col gap-8">
      <AgentForm />
      <ErrorAlert message={error} />
      {isLoading ? (
        <p className="text-sm text-muted">Carregando…</p>
      ) : agents.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted">Nenhum agente criado.</p>
      ) : (
        <ul className="divide-y divide-line border-y border-line">
          {agents.map((agent) =>
            agent.id === editingId ? (
              <li key={agent.id} className="py-4">
                <AgentForm agent={agent} onDone={() => setEditingId(null)} />
              </li>
            ) : (
              <AgentRow key={agent.id} agent={agent} onEdit={() => setEditingId(agent.id)} onError={setError} />
            ),
          )}
        </ul>
      )}
    </div>
  )
}

function AgentRow({ agent, onEdit, onError }: { agent: AiAgent; onEdit: () => void; onError: OnError }) {
  const update = useUpdateAiAgent()
  const remove = useDeleteAiAgent()
  const handlers = { onError: (err: Error) => onError(errorMessage(err)), onSuccess: () => onError(null) }
  return (
    <li className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="flex items-center gap-2 font-semibold">
          {agent.name}
          <Badge tone={agent.isActive ? 'brand' : 'neutral'}>{agent.isActive ? 'Ativo' : 'Inativo'}</Badge>
        </p>
        <p className="font-mono text-xs text-muted">
          {agent.provider.name} · {agent.model}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" disabled={update.isPending} onClick={() => update.mutate({ id: agent.id, isActive: !agent.isActive }, handlers)}>
          {agent.isActive ? 'Desativar' : 'Ativar'}
        </Button>
        <Button variant="ghost" onClick={onEdit}>
          Editar
        </Button>
        <Button variant="danger" disabled={remove.isPending} onClick={() => remove.mutate(agent.id, handlers)}>
          Excluir
        </Button>
      </div>
    </li>
  )
}
