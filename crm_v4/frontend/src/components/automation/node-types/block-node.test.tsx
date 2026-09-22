import { screen } from '@testing-library/react'
import { ReactFlow, ReactFlowProvider } from '@xyflow/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { FlowNode } from '@/lib/automation-types'
import { mockApi, renderWithClient } from '@/test/render'
import type { EditorNode } from '../graph-convert'
import { nodeTypes } from './block-node'
import { summarize } from './summary'

afterEach(() => vi.unstubAllGlobals())

function renderBlock(node: FlowNode, issues: string[] = []) {
  const nodes: EditorNode[] = [{ id: node.id, type: node.type, position: node.position, data: { config: node.config, issues } }]
  return renderWithClient(
    <ReactFlowProvider>
      <div style={{ width: 800, height: 600 }}>
        <ReactFlow nodes={nodes} edges={[]} nodeTypes={nodeTypes} />
      </div>
    </ReactFlowProvider>,
  )
}

const pos = { x: 0, y: 0 }
const handles = (type: 'source' | 'target') => document.querySelectorAll(`.react-flow__handle.${type}`)

describe('BlockNode', () => {
  it('shows the title, a summary and one labeled output per branch', () => {
    renderBlock({ id: 'c', type: 'condition', position: pos, config: { source: 'last_message', operator: 'contains', value: 'preço' } })
    expect(screen.getByText('Condição')).toBeInTheDocument()
    expect(screen.getByText('Mensagem contém “preço”')).toBeInTheDocument()
    expect(screen.getByText('sim')).toBeInTheDocument()
    expect(screen.getByText('não')).toBeInTheDocument()
    expect(handles('source')).toHaveLength(2)
    expect(handles('target')).toHaveLength(1)
  })

  it('gives triggers no input and terminal blocks no output', () => {
    renderBlock({ id: 't', type: 'trigger.manual', position: pos, config: {} })
    expect(handles('target')).toHaveLength(0)
    expect(handles('source')).toHaveLength(1)
  })

  it('lists the issues of the block', () => {
    renderBlock({ id: 'h', type: 'handoff', position: pos, config: { reason: 'Negociar' } }, ['Bloco desconectado: ligue-o ao fluxo ou remova.'])
    expect(screen.getByText('Bloco desconectado: ligue-o ao fluxo ou remova.')).toBeInTheDocument()
    expect(handles('source')).toHaveLength(0)
  })

  it('names the chosen agent', async () => {
    mockApi({
      'GET /api/ai-agents': () => ({
        body: [{ id: 'a1', name: 'Qualificação', isActive: false, provider: { id: 'p', name: 'P', vendor: 'openai' }, model: 'm', instructions: 'i', historySize: 20, updatedAt: '' }],
      }),
    })
    renderBlock({ id: 'a', type: 'ai_agent', position: pos, config: { agentId: 'a1', inactivityTimeout: { amount: 24, unit: 'hours' } } })
    expect(await screen.findByText('Qualificação (desativado)')).toBeInTheDocument()
    expect(screen.getByText('Sem resposta após 24 horas')).toBeInTheDocument()
  })
})

describe('summarize', () => {
  it('clips long texts and describes waits', () => {
    expect(summarize({ id: 's', type: 'send_text', position: pos, config: { text: 'x'.repeat(60) } })).toHaveLength(40)
    expect(summarize({ id: 'w', type: 'wait', position: pos, config: { amount: 5, unit: 'seconds' } })).toBe('5 segundos')
    expect(summarize({ id: 't', type: 'trigger.message_received', position: pos, config: { match: 'keyword', keywords: ['preço', 'valor'] } })).toBe(
      'Contém: preço, valor',
    )
  })
})
