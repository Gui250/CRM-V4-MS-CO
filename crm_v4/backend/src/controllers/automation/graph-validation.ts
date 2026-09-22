import { type FlowGraph, type FlowNode, isTrigger, REQUIRED_OUTPUTS_BY_TYPE } from './graph-schema.js'

export interface GraphIssue {
  nodeId?: string
  edgeId?: string
  message: string
}

export interface ValidationLookups {
  findAgent(agentId: string): Promise<{ isActive: boolean } | null>
  mediaExists(mediaPath: string): Promise<boolean>
}

function checkTrigger(graph: FlowGraph): GraphIssue[] {
  const triggers = graph.nodes.filter((n) => isTrigger(n.type))
  if (triggers.length === 0) return [{ message: 'Adicione um gatilho para o fluxo começar.' }]
  return triggers.slice(1).map((n) => ({ nodeId: n.id, message: 'O fluxo só pode ter um gatilho.' }))
}

function reachableFrom(startId: string, graph: FlowGraph): Set<string> {
  const seen = new Set([startId])
  const queue = [startId]
  for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
    for (const edge of graph.edges) {
      if (edge.source === id && !seen.has(edge.target)) {
        seen.add(edge.target)
        queue.push(edge.target)
      }
    }
  }
  return seen
}

function checkReachability(graph: FlowGraph): GraphIssue[] {
  const trigger = graph.nodes.find((n) => isTrigger(n.type))
  if (!trigger) return []
  const reachable = reachableFrom(trigger.id, graph)
  return graph.nodes
    .filter((n) => !reachable.has(n.id))
    .map((n) => ({ nodeId: n.id, message: 'Bloco desconectado: ligue-o ao fluxo ou remova.' }))
}

function checkOutputs(graph: FlowGraph): GraphIssue[] {
  const issues: GraphIssue[] = []
  for (const node of graph.nodes) {
    const outgoing = graph.edges.filter((e) => e.source === node.id)
    const seenHandles = new Set<string>()
    for (const edge of outgoing) {
      if (seenHandles.has(edge.sourceHandle)) {
        issues.push({ nodeId: node.id, edgeId: edge.id, message: 'Cada saída pode ter só uma conexão.' })
      }
      seenHandles.add(edge.sourceHandle)
    }
    const missing = (REQUIRED_OUTPUTS_BY_TYPE[node.type] ?? []).filter((handle) => !seenHandles.has(handle))
    if (missing.length > 0) issues.push({ nodeId: node.id, message: 'Conecte o gatilho ao primeiro bloco do fluxo.' })
  }
  return issues
}

async function checkReferences(node: FlowNode, lookups: ValidationLookups): Promise<GraphIssue | null> {
  if (node.type === 'ai_agent') {
    const agent = await lookups.findAgent(node.config.agentId)
    if (!agent) return { nodeId: node.id, message: 'O agente escolhido não existe mais.' }
    if (!agent.isActive) return { nodeId: node.id, message: 'O agente escolhido está desativado.' }
  }
  if (node.type === 'send_media' && !(await lookups.mediaExists(node.config.mediaPath))) {
    return { nodeId: node.id, message: 'O arquivo deste bloco não foi encontrado. Envie de novo.' }
  }
  return null
}

/** Activation rules (FR-006) on top of the shape checked by flowGraphSchema. Empty list = valid. */
export async function validateForActivation(graph: FlowGraph, lookups: ValidationLookups): Promise<GraphIssue[]> {
  const referenceIssues = await Promise.all(graph.nodes.map((node) => checkReferences(node, lookups)))
  return [
    ...checkTrigger(graph),
    ...checkReachability(graph),
    ...checkOutputs(graph),
    ...referenceIssues.filter((issue): issue is GraphIssue => issue !== null),
  ]
}
