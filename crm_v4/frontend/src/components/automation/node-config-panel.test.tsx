import { fireEvent, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { FlowNode, NodeType } from '@/lib/automation-types'
import { mockApi, renderWithClient } from '@/test/render'
import { NodeConfigPanel } from './node-config-panel'
import { defaultConfig } from './node-defaults'

afterEach(() => vi.unstubAllGlobals())

function node<T extends NodeType>(type: T, config = defaultConfig(type)): FlowNode {
  return { id: 'n1', type, position: { x: 0, y: 0 }, config } as FlowNode
}

/** Keeps the config in state like the editor does, and records every change. */
function setup(initial: FlowNode, issues?: string[]) {
  const onChange = vi.fn()
  function Harness() {
    const [current, setCurrent] = useState(initial)
    return (
      <NodeConfigPanel
        node={current}
        issues={issues}
        onChange={(config) => {
          onChange(config)
          setCurrent({ ...current, config } as FlowNode)
        }}
      />
    )
  }
  return { ...renderWithClient(<Harness />), onChange }
}

describe('NodeConfigPanel', () => {
  it('shows validation issues from the server', () => {
    setup(node('end'), ['Bloco desconectado: ligue-o ao fluxo ou remova.'])
    expect(screen.getByRole('alert')).toHaveTextContent('Bloco desconectado')
  })

  it('edits keyword triggers and validates the keyword list', async () => {
    const { user, onChange } = setup(node('trigger.message_received'))
    await user.click(screen.getByLabelText('Mensagem com palavra-chave'))
    expect(screen.getByText('Informe pelo menos uma palavra-chave.')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Palavras-chave'), 'preço, orçamento')
    expect(onChange).toHaveBeenLastCalledWith({ match: 'keyword', keywords: ['preço', 'orçamento'] })
    await user.click(screen.getByLabelText('Qualquer mensagem'))
    expect(onChange).toHaveBeenLastCalledWith({ match: 'any' })
  })

  it('inserts variables into the message text and counts characters', async () => {
    const { user, onChange } = setup(node('send_text', { text: 'Oi ' }))
    const area = screen.getByLabelText('Mensagem') as HTMLTextAreaElement
    area.setSelectionRange(3, 3)
    await user.click(screen.getByRole('button', { name: '+ Primeiro nome' }))
    expect(onChange).toHaveBeenLastCalledWith({ text: 'Oi {{contato.primeiro_nome}}' })
    expect(screen.getByText('28/4096')).toBeInTheDocument()
  })

  it('flags messages over 4.096 characters', () => {
    setup(node('send_text', { text: 'a'.repeat(4097) }))
    expect(screen.getByText('Limite de 4096 caracteres.')).toBeInTheDocument()
  })

  it('uploads a file for send_media and keeps the returned path', async () => {
    mockApi({
      'POST /api/flow-assets': () => ({ status: 201, body: { mediaPath: 'automation/a1/tabela.pdf', mime: 'application/pdf', filename: 'tabela.pdf', size: 10 } }),
    })
    const { user, onChange } = setup(node('send_media'))
    await user.upload(screen.getByLabelText('Arquivo'), new File(['x'], 'tabela.pdf', { type: 'application/pdf' }))
    await vi.waitFor(() =>
      expect(onChange).toHaveBeenLastCalledWith({ mediaPath: 'automation/a1/tabela.pdf', mime: 'application/pdf', filename: 'tabela.pdf' }),
    )
    expect(screen.getByText('tabela.pdf')).toBeInTheDocument()
  })

  it('shows the upload error from the API', async () => {
    mockApi({ 'POST /api/flow-assets': () => ({ status: 413, body: { code: 'FILE_TOO_LARGE', message: 'Arquivo acima do limite de 100 MB.' } }) })
    const { user } = setup(node('send_media'))
    await user.upload(screen.getByLabelText('Arquivo'), new File(['x'], 'big.pdf', { type: 'application/pdf' }))
    expect(await screen.findByText('Arquivo acima do limite de 100 MB.')).toBeInTheDocument()
  })

  it('rejects waits longer than 30 days', () => {
    setup(node('wait', { amount: 31, unit: 'days' }))
    expect(screen.getByText('A espera precisa ser de até 30 dias.')).toBeInTheDocument()
  })

  it('changes the wait_reply timeout unit', () => {
    const { onChange } = setup(node('wait_reply'))
    fireEvent.change(screen.getByLabelText('Tempo limite: unidade'), { target: { value: 'hours' } })
    expect(onChange).toHaveBeenLastCalledWith({ timeout: { amount: 1, unit: 'hours' } })
  })

  it('hides the value for "está vazio" conditions', async () => {
    const { user } = setup(node('condition'))
    expect(screen.getByLabelText('Valor')).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('Regra'), 'is_empty')
    expect(screen.queryByLabelText('Valor')).not.toBeInTheDocument()
  })

  it('lists agents and marks the inactive ones', async () => {
    mockApi({
      'GET /api/ai-agents': () => ({
        body: [
          { id: 'a1', name: 'Qualificação', isActive: true },
          { id: 'a2', name: 'Suporte', isActive: false },
        ],
      }),
    })
    const { user, onChange } = setup(node('ai_agent'))
    expect(await screen.findByRole('option', { name: 'Suporte (desativado)' })).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('Agente'), 'a1')
    expect(onChange).toHaveBeenLastCalledWith({ agentId: 'a1', inactivityTimeout: { amount: 24, unit: 'hours' } })
  })

  it('requires a hand-off reason', async () => {
    const { user } = setup(node('handoff'))
    await user.clear(screen.getByLabelText('Motivo mostrado à equipe'))
    expect(screen.getByText('Informe o motivo.')).toBeInTheDocument()
  })
})
