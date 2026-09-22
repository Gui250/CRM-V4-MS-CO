import type { Connection, Edge, Node, XYPosition } from '@xyflow/react'
import type { FlowGraph, FlowNode, NodeConfigs, NodeType } from '@/lib/automation-types'
import { defaultConfig, OUTPUT_LABELS } from './node-defaults'

// Our graph contract (contracts/flow-graph.md) ⇄ React Flow's nodes and edges.

export type Highlight = 'current' | 'visited' | 'failed'
export type BlockData = { config: NodeConfigs[NodeType]; issues: string[]; highlight?: Highlight }
export type EditorNode = Node<BlockData, NodeType>

export const OUTPUTS: Record<NodeType, readonly string[]> = {
  'trigger.message_received': ['next'],
  'trigger.manual': ['next'],
  send_text: ['next'],
  send_media: ['next'],
  wait: ['next'],
  wait_reply: ['replied', 'timeout'],
  condition: ['yes', 'no'],
  ai_agent: ['completed', 'no_reply', 'unavailable'],
  handoff: [],
  end: [],
}

export const isTriggerType = (type: string) => type.startsWith('trigger.')

const edgeLabel = (handle: string) => OUTPUT_LABELS[handle] ?? handle

export function toReactFlow(graph: FlowGraph | null): { nodes: EditorNode[]; edges: Edge[] } {
  return {
    nodes: (graph?.nodes ?? []).map((n) => ({ id: n.id, type: n.type, position: n.position, data: { config: n.config, issues: [] } })),
    edges: (graph?.edges ?? []).map((e) => ({ ...e, label: edgeLabel(e.sourceHandle) })),
  }
}

export function fromReactFlow(nodes: EditorNode[], edges: Edge[]): FlowGraph {
  return {
    nodes: nodes.map((n) => ({ id: n.id, type: n.type, position: { x: n.position.x, y: n.position.y }, config: n.data.config }) as FlowNode),
    edges: edges.map((e) => ({ id: e.id, source: e.source, sourceHandle: e.sourceHandle ?? 'next', target: e.target })),
  }
}

const randomId = (prefix: string) => `${prefix}${Math.random().toString(36).slice(2, 10)}`

export function newNode(type: NodeType, position: XYPosition): EditorNode {
  return { id: randomId('n'), type, position, data: { config: defaultConfig(type), issues: [] }, selected: true }
}

export const newEdge = (connection: Connection): Edge => ({
  id: randomId('e'),
  source: connection.source,
  sourceHandle: connection.sourceHandle ?? 'next',
  target: connection.target,
  label: edgeLabel(connection.sourceHandle ?? 'next'),
})

/** Enforced while drawing: no self-loops, nothing into a trigger, one edge per output. */
export function canConnect(connection: Pick<Connection, 'source' | 'target' | 'sourceHandle'>, nodes: EditorNode[], edges: Edge[]) {
  if (connection.source === connection.target) return false
  const target = nodes.find((n) => n.id === connection.target)
  if (!target || isTriggerType(target.type)) return false
  return !edges.some((e) => e.source === connection.source && (e.sourceHandle ?? 'next') === (connection.sourceHandle ?? 'next'))
}
