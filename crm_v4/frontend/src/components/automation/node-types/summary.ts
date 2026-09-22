import type { FlowNode } from '@/lib/automation-types'
import { UNIT_LABELS } from '../node-defaults'

const SUMMARY_MAX = 40
const MATCH_LABELS = { any: 'Qualquer mensagem', first_message: 'Primeira mensagem do contato', keyword: 'Palavra-chave' }
const SOURCE_LABELS = { last_message: 'Mensagem', contact_name: 'Nome', contact_phone: 'Telefone' }
const OPERATOR_LABELS = { contains: 'contém', equals: 'é igual a', starts_with: 'começa com', is_empty: 'está vazio' }

const clip = (text: string) => (text.length > SUMMARY_MAX ? `${text.slice(0, SUMMARY_MAX - 1)}…` : text)
const duration = (d: { amount: number; unit: keyof typeof UNIT_LABELS }) => `${d.amount} ${UNIT_LABELS[d.unit]}`

/** One line under the block title. The agent block shows its agent name separately (needs a query). */
export function summarize(node: FlowNode): string {
  switch (node.type) {
    case 'trigger.message_received':
      return node.config.match === 'keyword' ? clip(`Contém: ${(node.config.keywords ?? []).join(', ')}`) : MATCH_LABELS[node.config.match]
    case 'trigger.manual':
      return 'Disparado pelo atendente no chat'
    case 'send_text':
      return clip(node.config.text)
    case 'send_media':
      return node.config.filename ? clip(node.config.filename) : 'Nenhum arquivo'
    case 'wait':
      return duration(node.config)
    case 'wait_reply':
      return `Até ${duration(node.config.timeout)}`
    case 'condition': {
      const { source, operator, value } = node.config
      return clip(`${SOURCE_LABELS[source]} ${OPERATOR_LABELS[operator]}${operator === 'is_empty' ? '' : ` “${value}”`}`)
    }
    case 'ai_agent':
      return `Sem resposta após ${duration(node.config.inactivityTimeout)}`
    case 'handoff':
      return clip(node.config.reason)
    case 'end':
      return 'Fim da execução'
  }
}
