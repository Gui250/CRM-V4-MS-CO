import type { Duration, NodeConfigs, NodeType } from '@/lib/automation-types'

export const NODE_LABELS: Record<NodeType, string> = {
  'trigger.message_received': 'Mensagem recebida',
  'trigger.manual': 'Disparo manual',
  send_text: 'Enviar texto',
  send_media: 'Enviar arquivo',
  wait: 'Esperar',
  wait_reply: 'Esperar resposta',
  condition: 'Condição',
  ai_agent: 'Agente de IA',
  handoff: 'Passar para humano',
  end: 'Encerrar',
}

export const OUTPUT_LABELS: Record<string, string> = {
  next: 'próximo',
  yes: 'sim',
  no: 'não',
  replied: 'respondeu',
  timeout: 'sem resposta',
  completed: 'concluído',
  no_reply: 'sem resposta',
  unavailable: 'indisponível',
}

export const UNIT_LABELS: Record<Duration['unit'], string> = {
  seconds: 'segundos',
  minutes: 'minutos',
  hours: 'horas',
  days: 'dias',
}

const UNIT_MS: Record<Duration['unit'], number> = { seconds: 1_000, minutes: 60_000, hours: 3_600_000, days: 86_400_000 }
export const durationMs = (d: Duration) => d.amount * UNIT_MS[d.unit]
export const MINUTE_MS = UNIT_MS.minutes
export const THIRTY_DAYS_MS = 30 * UNIT_MS.days

const DEFAULTS: { [T in NodeType]: NodeConfigs[T] } = {
  'trigger.message_received': { match: 'first_message' },
  'trigger.manual': {},
  send_text: { text: 'Olá, {{contato.primeiro_nome}}!' },
  // Invalid until a file is uploaded; the panel and activation both flag it.
  send_media: { mediaPath: '', mime: '', filename: '' },
  wait: { amount: 5, unit: 'minutes' },
  wait_reply: { timeout: { amount: 1, unit: 'days' } },
  condition: { source: 'last_message', operator: 'contains', value: '' },
  ai_agent: { agentId: '', inactivityTimeout: { amount: 24, unit: 'hours' } },
  handoff: { reason: 'Transferido pelo fluxo' },
  end: {},
}

export function defaultConfig<T extends NodeType>(type: T): NodeConfigs[T] {
  return structuredClone(DEFAULTS[type])
}
