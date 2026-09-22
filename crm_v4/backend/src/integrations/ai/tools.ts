import type { ToolDefinition } from './index.js'

export const HANDOFF_TOOL = 'transferir_para_humano'
export const FINISH_TOOL = 'encerrar_atendimento'

/** The only two tools an agent gets (research §5); both end the agent's turn in the flow. */
export const AGENT_TOOLS: ToolDefinition[] = [
  {
    name: HANDOFF_TOOL,
    description:
      'Passa a conversa para um atendente humano. Use quando o contato pedir uma pessoa, quando você não souber responder ou quando as instruções mandarem.',
    parameters: {
      type: 'object',
      properties: {
        motivo: { type: 'string', description: 'Motivo da transferência, em uma frase, para a equipe.' },
        resumo: { type: 'string', description: 'Resumo da conversa até aqui, em até 3 frases, para o atendente.' },
      },
      required: ['motivo', 'resumo'],
      additionalProperties: false,
    },
  },
  {
    name: FINISH_TOOL,
    description: 'Encerra o atendimento quando o objetivo das instruções foi cumprido e o contato não precisa de mais nada.',
    parameters: {
      type: 'object',
      properties: { resumo: { type: 'string', description: 'Resumo do atendimento em até 3 frases.' } },
      required: ['resumo'],
      additionalProperties: false,
    },
  },
]
