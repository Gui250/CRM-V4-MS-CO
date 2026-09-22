'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/input'
import type { FlowStatus, FlowSummary, FlowTrigger } from '@/lib/automation-types'
import {
  useActivateFlow,
  useCreateFlow,
  useDeactivateFlow,
  useDeleteFlow,
  useDuplicateFlow,
  useFlows,
  useUpdateFlow,
} from '@/lib/use-automation'
import { ErrorAlert, errorMessage, formatDateTime } from './error-alert'

export const STATUS_LABELS: Record<FlowStatus, string> = { draft: 'Rascunho', active: 'Ativo', inactive: 'Inativo' }
const TRIGGER_LABELS: Record<FlowTrigger, string> = { message_received: 'Mensagem recebida', manual: 'Disparo manual' }
const PRIORITY_MIN = 1
const PRIORITY_MAX = 1000

type OnError = (message: string | null) => void

export function FlowList() {
  const [error, setError] = useState<string | null>(null)
  const { data: flows = [], isLoading } = useFlows()

  return (
    <div className="flex flex-col gap-5">
      <NewFlowForm onError={setError} />
      <ErrorAlert message={error} />
      {isLoading ? (
        <p className="text-sm text-muted">Carregando…</p>
      ) : flows.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted">Nenhum fluxo criado ainda.</p>
      ) : (
        <ul className="divide-y divide-line border-y border-line">
          {flows.map((flow) => (
            <FlowRow key={flow.id} flow={flow} onError={setError} />
          ))}
        </ul>
      )}
    </div>
  )
}

function NewFlowForm({ onError }: { onError: OnError }) {
  const router = useRouter()
  const [name, setName] = useState('')
  const create = useCreateFlow()

  function submit(event: React.FormEvent) {
    event.preventDefault()
    onError(null)
    create.mutate(
      { name: name.trim() },
      {
        onSuccess: (flow) => flow && router.push(`/automacoes/${flow.id}`),
        onError: (err) => onError(errorMessage(err, 'Não foi possível criar o fluxo.')),
      },
    )
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <Field label="Nome do novo fluxo" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} className="flex-1" />
      <Button type="submit" disabled={name.trim().length === 0 || create.isPending}>
        Novo fluxo
      </Button>
    </form>
  )
}

function FlowRow({ flow, onError }: { flow: FlowSummary; onError: OnError }) {
  return (
    <li className="flex flex-col gap-3 py-4 lg:flex-row lg:items-center lg:justify-between">
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2 font-semibold">
          <Link href={`/automacoes/${flow.id}`} className="hover:text-brand">
            {flow.name}
          </Link>
          <Badge tone={flow.status === 'active' ? 'brand' : 'neutral'}>{STATUS_LABELS[flow.status]}</Badge>
        </p>
        <p className="text-xs text-muted">
          {flow.trigger ? TRIGGER_LABELS[flow.trigger] : '—'} · Última execução: {flow.lastRunAt ? formatDateTime(flow.lastRunAt) : 'Nunca'}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <PriorityInput flow={flow} onError={onError} />
        <Link href={`/automacoes/${flow.id}/execucoes`} className="px-2 text-sm font-semibold underline">
          Execuções
        </Link>
        <FlowActions flow={flow} onError={onError} />
      </div>
    </li>
  )
}

function PriorityInput({ flow, onError }: { flow: FlowSummary; onError: OnError }) {
  const [value, setValue] = useState(String(flow.priority))
  const update = useUpdateFlow()

  function save() {
    const priority = Number(value)
    if (priority === flow.priority) return
    if (!Number.isInteger(priority) || priority < PRIORITY_MIN || priority > PRIORITY_MAX) {
      onError(`A prioridade precisa ser um número entre ${PRIORITY_MIN} e ${PRIORITY_MAX}.`)
      setValue(String(flow.priority))
      return
    }
    onError(null)
    update.mutate({ id: flow.id, priority }, { onError: (err) => onError(errorMessage(err)) })
  }

  return (
    <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em]">
      Prioridade
      <input
        type="number"
        min={PRIORITY_MIN}
        max={PRIORITY_MAX}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        className="h-10 w-20 border-b-2 border-ink/20 bg-mist px-2 text-sm outline-none focus:border-brand"
      />
    </label>
  )
}

function FlowActions({ flow, onError }: { flow: FlowSummary; onError: OnError }) {
  const activate = useActivateFlow()
  const deactivate = useDeactivateFlow()
  const duplicate = useDuplicateFlow()
  const isActive = flow.status === 'active'
  const handlers = { onError: (err: Error) => onError(errorMessage(err)), onSuccess: () => onError(null) }
  const busy = activate.isPending || deactivate.isPending || duplicate.isPending

  return (
    <>
      <Button
        variant={isActive ? 'secondary' : 'primary'}
        disabled={busy}
        onClick={() => (isActive ? deactivate.mutate(flow.id, handlers) : activate.mutate(flow.id, handlers))}
      >
        {isActive ? 'Desativar' : 'Ativar'}
      </Button>
      <Button variant="ghost" disabled={busy} onClick={() => duplicate.mutate(flow.id, handlers)}>
        Duplicar
      </Button>
      <DeleteFlowButton flow={flow} onError={onError} />
    </>
  )
}

function DeleteFlowButton({ flow, onError }: { flow: FlowSummary; onError: OnError }) {
  const [isConfirming, setIsConfirming] = useState(false)
  const remove = useDeleteFlow()

  if (!isConfirming) {
    return (
      <Button variant="danger" disabled={flow.status === 'active'} title={flow.status === 'active' ? 'Desative antes de excluir' : undefined} onClick={() => setIsConfirming(true)}>
        Excluir
      </Button>
    )
  }
  return (
    <span className="flex items-center gap-2 text-sm">
      Confirmar exclusão?
      <Button
        variant="danger"
        disabled={remove.isPending}
        onClick={() => remove.mutate(flow.id, { onError: (err) => onError(errorMessage(err)), onSettled: () => setIsConfirming(false) })}
      >
        Sim, excluir
      </Button>
      <Button variant="ghost" onClick={() => setIsConfirming(false)}>
        Cancelar
      </Button>
    </span>
  )
}
