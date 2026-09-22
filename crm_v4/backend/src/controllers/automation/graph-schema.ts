import { z } from 'zod'

// Contract: specs/003-automation-flows-ai-agents/contracts/flow-graph.md

export const MAX_NODES = 200
export const MAX_EDGES = 400
export const TEXT_MAX = 4096
export const CAPTION_MAX = 1024

const UNIT_MS = {
  seconds: 1_000,
  minutes: 60_000,
  hours: 3_600_000,
  days: 86_400_000,
} as const

const MINUTE_MS = UNIT_MS.minutes
const THIRTY_DAYS_MS = 30 * UNIT_MS.days

const durationSchema = z.object({
  amount: z.number().int().min(1),
  unit: z.enum(['seconds', 'minutes', 'hours', 'days']),
})
export type Duration = z.infer<typeof durationSchema>

export const durationMs = (duration: Duration) => duration.amount * UNIT_MS[duration.unit]

const durationBetween = (minMs: number, maxMs: number, message: string) =>
  durationSchema.refine((d) => durationMs(d) >= minMs && durationMs(d) <= maxMs, { message })

const idSchema = z.string().regex(/^[A-Za-z0-9_-]{1,40}$/, 'Identificador inválido.')
const positionSchema = z.object({ x: z.number(), y: z.number() })
const node = <T extends string, C extends z.ZodType>(type: T, config: C) =>
  z.object({ id: idSchema, type: z.literal(type), position: positionSchema, config })

const keywordTrigger = z
  .object({
    match: z.enum(['any', 'first_message', 'keyword']),
    keywords: z.array(z.string().trim().min(1).max(50)).min(1).max(20).optional(),
  })
  .refine((c) => (c.match === 'keyword') === (c.keywords !== undefined), {
    message: 'Informe de 1 a 20 palavras-chave só quando o gatilho for por palavra-chave.',
    path: ['keywords'],
  })

export const nodeSchema = z.discriminatedUnion('type', [
  node('trigger.message_received', keywordTrigger),
  node('trigger.manual', z.object({})),
  node('send_text', z.object({ text: z.string().trim().min(1).max(TEXT_MAX) })),
  node(
    'send_media',
    z.object({
      mediaPath: z
        .string()
        .regex(/^automation\/[A-Za-z0-9._-]+\/[^/]{1,255}$/, 'Arquivo inválido.')
        .refine((path) => !path.includes('..'), 'Arquivo inválido.'),
      mime: z.string().min(1).max(100),
      filename: z.string().min(1).max(255),
      caption: z.string().max(CAPTION_MAX).optional(),
    }),
  ),
  node('wait', durationBetween(UNIT_MS.seconds, THIRTY_DAYS_MS, 'A espera precisa ser de até 30 dias.')),
  node(
    'wait_reply',
    z.object({ timeout: durationBetween(MINUTE_MS, THIRTY_DAYS_MS, 'O tempo limite precisa ser entre 1 minuto e 30 dias.') }),
  ),
  node(
    'condition',
    z.object({
      source: z.enum(['last_message', 'contact_name', 'contact_phone']),
      operator: z.enum(['contains', 'equals', 'starts_with', 'is_empty']),
      value: z.string().max(200).default(''),
    }),
  ),
  node(
    'ai_agent',
    z.object({
      agentId: z.uuid(),
      inactivityTimeout: durationBetween(MINUTE_MS, THIRTY_DAYS_MS, 'O tempo sem resposta precisa ser entre 1 minuto e 30 dias.').default({
        amount: 24,
        unit: 'hours',
      }),
    }),
  ),
  node('handoff', z.object({ reason: z.string().trim().min(1).max(200) })),
  node('end', z.object({})),
])

export type FlowNode = z.infer<typeof nodeSchema>
export type NodeType = FlowNode['type']
export type NodeOfType<T extends NodeType> = Extract<FlowNode, { type: T }>

export const OUTPUTS_BY_TYPE: Record<NodeType, readonly string[]> = {
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

/**
 * Outputs that must be connected before activation. Any other output left dangling ends the run,
 * so "send a message and stop" needs no explicit end block.
 */
export const REQUIRED_OUTPUTS_BY_TYPE: Partial<Record<NodeType, readonly string[]>> = {
  'trigger.message_received': ['next'],
  'trigger.manual': ['next'],
}

export const isTrigger = (type: NodeType) => type.startsWith('trigger.')

const edgeSchema = z.object({ id: idSchema, source: idSchema, sourceHandle: z.string().min(1).max(40), target: idSchema })
export type FlowEdge = z.infer<typeof edgeSchema>

function addDuplicateIssues(ids: string[], path: 'nodes' | 'edges', ctx: z.RefinementCtx) {
  const seen = new Set<string>()
  ids.forEach((id, index) => {
    if (seen.has(id)) ctx.addIssue({ code: 'custom', path: [path, index, 'id'], message: `Identificador repetido: ${id}.` })
    seen.add(id)
  })
}

function addEdgeIssues(graph: { nodes: FlowNode[]; edges: FlowEdge[] }, ctx: z.RefinementCtx) {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]))
  graph.edges.forEach((edge, index) => {
    const source = byId.get(edge.source)
    const target = byId.get(edge.target)
    if (!source || !target) {
      ctx.addIssue({ code: 'custom', path: ['edges', index], message: 'Conexão aponta para um bloco que não existe.' })
    } else if (!OUTPUTS_BY_TYPE[source.type].includes(edge.sourceHandle)) {
      ctx.addIssue({ code: 'custom', path: ['edges', index, 'sourceHandle'], message: 'Saída inválida para este bloco.' })
    } else if (isTrigger(target.type)) {
      ctx.addIssue({ code: 'custom', path: ['edges', index], message: 'Um gatilho não pode receber conexões.' })
    }
  })
}

/** Shape rules checked on every save; activation rules live in graph-validation.ts. */
export const flowGraphSchema = z
  .object({
    nodes: z.array(nodeSchema).max(MAX_NODES),
    edges: z.array(edgeSchema).max(MAX_EDGES),
  })
  .superRefine((graph, ctx) => {
    addDuplicateIssues(graph.nodes.map((n) => n.id), 'nodes', ctx)
    addDuplicateIssues(graph.edges.map((e) => e.id), 'edges', ctx)
    addEdgeIssues(graph, ctx)
  })

export type FlowGraph = z.infer<typeof flowGraphSchema>

export const triggerTypeOf = (graph: FlowGraph) => {
  const trigger = graph.nodes.find((n) => isTrigger(n.type))
  if (trigger?.type === 'trigger.message_received') return 'message_received' as const
  if (trigger?.type === 'trigger.manual') return 'manual' as const
  return null
}
