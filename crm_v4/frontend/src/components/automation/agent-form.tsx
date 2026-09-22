'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/input'
import {
  AGENT_INSTRUCTIONS_MAX,
  type AiAgent,
  type AiAgentInput,
  type AiProvider,
  HISTORY_SIZE_DEFAULT,
  HISTORY_SIZE_MAX,
  HISTORY_SIZE_MIN,
} from '@/lib/automation-types'
import { useAiProviders, useCreateAiAgent, useUpdateAiAgent } from '@/lib/use-automation'
import { ErrorAlert, errorMessage } from './error-alert'

const NAME_MIN = 2
const NAME_MAX = 60

const emptyInput: AiAgentInput = { name: '', providerId: '', model: '', instructions: '', historySize: HISTORY_SIZE_DEFAULT }

export function validateAgent(input: AiAgentInput): string | null {
  const name = input.name.trim()
  if (name.length < NAME_MIN || name.length > NAME_MAX) return `O nome precisa ter entre ${NAME_MIN} e ${NAME_MAX} caracteres.`
  if (!input.providerId) return 'Escolha um provedor.'
  if (!input.model) return 'Escolha um modelo.'
  const instructions = input.instructions.trim()
  if (instructions.length === 0 || instructions.length > AGENT_INSTRUCTIONS_MAX) {
    return `As instruções precisam ter entre 1 e ${AGENT_INSTRUCTIONS_MAX} caracteres.`
  }
  if (!Number.isInteger(input.historySize) || input.historySize < HISTORY_SIZE_MIN || input.historySize > HISTORY_SIZE_MAX) {
    return `O histórico precisa ter entre ${HISTORY_SIZE_MIN} e ${HISTORY_SIZE_MAX} mensagens.`
  }
  return null
}

const toInput = (agent: AiAgent): AiAgentInput => ({
  name: agent.name,
  providerId: agent.provider.id,
  model: agent.model,
  instructions: agent.instructions,
  historySize: agent.historySize,
})

export function AgentForm({ agent, onDone }: { agent?: AiAgent; onDone?: () => void }) {
  const [input, setInput] = useState<AiAgentInput>(agent ? toInput(agent) : emptyInput)
  const [error, setError] = useState<string | null>(null)
  const { data: providers, isLoading } = useAiProviders()
  const create = useCreateAiAgent()
  const update = useUpdateAiAgent()
  const isPending = create.isPending || update.isPending

  if (isLoading || !providers) return <p className="text-sm text-muted">Carregando…</p>
  if (providers.length === 0) return <NoProviders />

  function submit(event: React.FormEvent) {
    event.preventDefault()
    const problem = validateAgent(input)
    setError(problem)
    if (problem) return
    const body = { ...input, name: input.name.trim(), instructions: input.instructions.trim() }
    const handlers = {
      onSuccess: () => (agent ? onDone?.() : setInput(emptyInput)),
      onError: (err: Error) => setError(errorMessage(err, 'Não foi possível salvar o agente.')),
    }
    if (agent) update.mutate({ id: agent.id, ...body }, handlers)
    else create.mutate(body, handlers)
  }

  return (
    <form onSubmit={submit} aria-label={agent ? `Editar ${agent.name}` : 'Novo agente'} className="flex flex-col gap-4 border border-line p-5">
      <h2 className="text-sm font-bold uppercase tracking-[0.12em]">{agent ? `Editar ${agent.name}` : 'Novo agente'}</h2>
      <Field label="Nome" value={input.name} maxLength={NAME_MAX} onChange={(e) => setInput({ ...input, name: e.target.value })} />
      <ProviderAndModel providers={providers} input={input} onChange={setInput} />
      <InstructionsField value={input.instructions} onChange={(instructions) => setInput({ ...input, instructions })} />
      <Field
        label="Mensagens do histórico lidas"
        type="number"
        min={HISTORY_SIZE_MIN}
        max={HISTORY_SIZE_MAX}
        value={input.historySize}
        onChange={(e) => setInput({ ...input, historySize: Number(e.target.value) })}
        hint={`Entre ${HISTORY_SIZE_MIN} e ${HISTORY_SIZE_MAX}.`}
      />
      <ErrorAlert message={error} />
      <div className="flex gap-2">
        <Button type="submit" disabled={isPending}>
          {agent ? 'Salvar alterações' : 'Criar agente'}
        </Button>
        {agent && (
          <Button variant="ghost" onClick={onDone}>
            Cancelar
          </Button>
        )}
      </div>
    </form>
  )
}

function NoProviders() {
  return (
    <p className="border border-line p-5 text-sm">
      Cadastre um provedor de IA antes de criar agentes.{' '}
      <Link href="/automacoes/provedores" className="font-semibold underline">
        Ir para Provedores de IA
      </Link>
    </p>
  )
}

const selectClass = 'h-11 border-b-2 border-ink/20 bg-mist px-3 text-base normal-case tracking-normal'
const labelClass = 'flex flex-col gap-1.5 text-xs font-semibold uppercase tracking-[0.12em]'

function ProviderAndModel({
  providers,
  input,
  onChange,
}: {
  providers: AiProvider[]
  input: AiAgentInput
  onChange: (input: AiAgentInput) => void
}) {
  const models = providers.find((p) => p.id === input.providerId)?.availableModels ?? []
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <label className={labelClass}>
        Provedor
        <select value={input.providerId} onChange={(e) => onChange({ ...input, providerId: e.target.value, model: '' })} className={selectClass}>
          <option value="">Escolha…</option>
          {providers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <label className={labelClass}>
        Modelo
        <select value={input.model} disabled={models.length === 0} onChange={(e) => onChange({ ...input, model: e.target.value })} className={selectClass}>
          <option value="">Escolha…</option>
          {models.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}

function InstructionsField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <label className={labelClass}>
      Instruções
      <textarea
        value={value}
        maxLength={AGENT_INSTRUCTIONS_MAX}
        rows={8}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Personalidade, o que pode ou não responder e quando passar para uma pessoa."
        className="border-b-2 border-ink/20 bg-mist p-3 text-base normal-case tracking-normal outline-none focus:border-brand"
      />
      <span className="self-end font-mono text-[11px] font-normal text-muted">
        {value.length} / {AGENT_INSTRUCTIONS_MAX}
      </span>
    </label>
  )
}
