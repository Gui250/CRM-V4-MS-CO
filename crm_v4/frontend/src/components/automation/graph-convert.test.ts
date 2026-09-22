import { describe, expect, it } from 'vitest'
import type { FlowGraph } from '@/lib/automation-types'
import { canConnect, fromReactFlow, newNode, toReactFlow } from './graph-convert'

const graph: FlowGraph = {
  nodes: [
    { id: 't', type: 'trigger.message_received', position: { x: 0, y: 0 }, config: { match: 'any' } },
    { id: 'c', type: 'condition', position: { x: 0, y: 120 }, config: { source: 'last_message', operator: 'contains', value: 'preço' } },
    { id: 's', type: 'send_text', position: { x: 0, y: 240 }, config: { text: 'oi' } },
  ],
  edges: [
    { id: 'e1', source: 't', sourceHandle: 'next', target: 'c' },
    { id: 'e2', source: 'c', sourceHandle: 'yes', target: 's' },
  ],
}

describe('graph conversion', () => {
  it('round-trips the contract graph', () => {
    const { nodes, edges } = toReactFlow(graph)
    expect(nodes[1]).toMatchObject({ id: 'c', type: 'condition', data: { config: graph.nodes[1]!.config, issues: [] } })
    expect(edges[1]).toMatchObject({ label: 'sim' })
    expect(fromReactFlow(nodes, edges)).toEqual(graph)
  })

  it('treats a flow without version as empty', () => {
    expect(toReactFlow(null)).toEqual({ nodes: [], edges: [] })
  })

  it('creates selected nodes with a default config and unique ids', () => {
    const a = newNode('wait', { x: 1, y: 2 })
    const b = newNode('wait', { x: 1, y: 2 })
    expect(a).toMatchObject({ type: 'wait', position: { x: 1, y: 2 }, selected: true, data: { config: { amount: 5, unit: 'minutes' } } })
    expect(a.id).not.toBe(b.id)
  })
})

describe('canConnect', () => {
  const { nodes, edges } = toReactFlow(graph)

  it('allows a free output to a non-trigger block', () => {
    expect(canConnect({ source: 'c', sourceHandle: 'no', target: 's' }, nodes, edges)).toBe(true)
  })

  it('rejects a second edge on the same output', () => {
    expect(canConnect({ source: 'c', sourceHandle: 'yes', target: 's' }, nodes, edges)).toBe(false)
  })

  it('rejects edges into a trigger and self-loops', () => {
    expect(canConnect({ source: 's', sourceHandle: 'next', target: 't' }, nodes, edges)).toBe(false)
    expect(canConnect({ source: 's', sourceHandle: 'next', target: 's' }, nodes, edges)).toBe(false)
  })
})
