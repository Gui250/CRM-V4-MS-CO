'use client'

import type { Duration, NodeConfigs } from '@/lib/automation-types'
import { useAiAgents } from '@/lib/use-automation'
import { durationMs, MINUTE_MS, THIRTY_DAYS_MS } from '../node-defaults'
import { DurationField, FieldError, SelectField, TextAreaField } from './fields'

const durationProblem = (d: Duration, minMs: number, message: string) =>
  !Number.isInteger(d.amount) || d.amount < 1 || durationMs(d) < minMs || durationMs(d) > THIRTY_DAYS_MS ? message : null

type WaitConfig = NodeConfigs['wait']
export function WaitForm({ config, onChange }: { config: WaitConfig; onChange: (c: WaitConfig) => void }) {
  return <DurationField label="Esperar por" value={config} onChange={onChange} error={durationProblem(config, 1_000, 'A espera precisa ser de até 30 dias.')} />
}

type WaitReplyConfig = NodeConfigs['wait_reply']
export function WaitReplyForm({ config, onChange }: { config: WaitReplyConfig; onChange: (c: WaitReplyConfig) => void }) {
  return (
    <div className="flex flex-col gap-2">
      <DurationField
        label="Tempo limite"
        value={config.timeout}
        onChange={(timeout) => onChange({ timeout })}
        error={durationProblem(config.timeout, MINUTE_MS, 'O tempo limite precisa ser entre 1 minuto e 30 dias.')}
      />
      <p className="text-xs text-muted">Segue por &quot;respondeu&quot; quando o contato responder, ou por &quot;sem resposta&quot; ao fim do prazo.</p>
    </div>
  )
}

type ConditionConfig = NodeConfigs['condition']
const SOURCES: Record<ConditionConfig['source'], string> = {
  last_message: 'Última mensagem do contato',
  contact_name: 'Nome do contato',
  contact_phone: 'Telefone do contato',
}
const OPERATORS: Record<ConditionConfig['operator'], string> = {
  contains: 'contém',
  equals: 'é igual a',
  starts_with: 'começa com',
  is_empty: 'está vazio',
}
const VALUE_MAX = 200

export function ConditionForm({ config, onChange }: { config: ConditionConfig; onChange: (c: ConditionConfig) => void }) {
  return (
    <div className="flex flex-col gap-3">
      <SelectField label="Campo" value={config.source} onChange={(e) => onChange({ ...config, source: e.target.value as ConditionConfig['source'] })}>
        {Object.entries(SOURCES).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </SelectField>
      <SelectField label="Regra" value={config.operator} onChange={(e) => onChange({ ...config, operator: e.target.value as ConditionConfig['operator'] })}>
        {Object.entries(OPERATORS).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </SelectField>
      {config.operator !== 'is_empty' && (
        <TextAreaField label="Valor" rows={1} max={VALUE_MAX} value={config.value} onChange={(e) => onChange({ ...config, value: e.target.value })} />
      )}
      <p className="text-xs text-muted">Maiúsculas e acentos são ignorados.</p>
    </div>
  )
}

type AgentConfig = NodeConfigs['ai_agent']
export function AgentForm({ config, onChange }: { config: AgentConfig; onChange: (c: AgentConfig) => void }) {
  const { data: agents = [], isLoading } = useAiAgents()
  return (
    <div className="flex flex-col gap-3">
      <SelectField label="Agente" value={config.agentId} onChange={(e) => onChange({ ...config, agentId: e.target.value })} disabled={isLoading}>
        <option value="">Escolha um agente</option>
        {agents.map((a) => (
          <option key={a.id} value={a.id}>
            {a.isActive ? a.name : `${a.name} (desativado)`}
          </option>
        ))}
      </SelectField>
      {!config.agentId && <FieldError>Escolha o agente que vai atender.</FieldError>}
      <DurationField
        label="Encerrar sem resposta após"
        value={config.inactivityTimeout}
        onChange={(inactivityTimeout) => onChange({ ...config, inactivityTimeout })}
        error={durationProblem(config.inactivityTimeout, MINUTE_MS, 'O tempo precisa ser entre 1 minuto e 30 dias.')}
      />
    </div>
  )
}

type HandoffConfig = NodeConfigs['handoff']
const REASON_MAX = 200
export function HandoffForm({ config, onChange }: { config: HandoffConfig; onChange: (c: HandoffConfig) => void }) {
  return (
    <TextAreaField
      label="Motivo mostrado à equipe"
      rows={2}
      max={REASON_MAX}
      value={config.reason}
      onChange={(e) => onChange({ reason: e.target.value })}
      error={config.reason.trim() ? undefined : 'Informe o motivo.'}
    />
  )
}
