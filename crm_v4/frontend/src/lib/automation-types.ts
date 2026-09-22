// Contract: specs/003-automation-flows-ai-agents/contracts/{openapi.yaml,flow-graph.md}

export type DurationUnit = 'seconds' | 'minutes' | 'hours' | 'days'
export interface Duration {
  amount: number
  unit: DurationUnit
}

export interface NodeConfigs {
  'trigger.message_received': { match: 'any' | 'first_message' | 'keyword'; keywords?: string[] }
  'trigger.manual': Record<string, never>
  send_text: { text: string }
  send_media: { mediaPath: string; mime: string; filename: string; caption?: string }
  wait: Duration
  wait_reply: { timeout: Duration }
  condition: {
    source: 'last_message' | 'contact_name' | 'contact_phone'
    operator: 'contains' | 'equals' | 'starts_with' | 'is_empty'
    value: string
  }
  ai_agent: { agentId: string; inactivityTimeout: Duration }
  handoff: { reason: string }
  end: Record<string, never>
}

export type NodeType = keyof NodeConfigs

export type FlowNode = {
  [T in NodeType]: { id: string; type: T; position: { x: number; y: number }; config: NodeConfigs[T] }
}[NodeType]

export type NodeOfType<T extends NodeType> = Extract<FlowNode, { type: T }>

export interface FlowEdge {
  id: string
  source: string
  sourceHandle: string
  target: string
}

export interface FlowGraph {
  nodes: FlowNode[]
  edges: FlowEdge[]
}

export interface GraphIssue {
  nodeId?: string
  edgeId?: string
  message: string
}

export type FlowStatus = 'draft' | 'active' | 'inactive'
export type FlowTrigger = 'message_received' | 'manual'

export interface FlowSummary {
  id: string
  name: string
  description: string | null
  status: FlowStatus
  trigger: FlowTrigger | null
  priority: number
  versionNumber: number | null
  updatedAt: string
  lastRunAt: string | null
}

export interface Flow extends FlowSummary {
  graph: FlowGraph | null
}

export type RunStatus = 'running' | 'waiting' | 'completed' | 'failed' | 'cancelled'
export type RunEndReason = 'completed' | 'handoff' | 'opt_out' | 'flow_deactivated' | 'stopped_by_user' | 'loop_limit' | 'error'

export interface RunSummary {
  id: string
  flowId: string
  flowName: string
  versionNumber: number
  conversationId: string
  contact: { name: string | null; phone: string }
  origin: 'message_received' | 'manual' | 'test'
  status: RunStatus
  currentNodeId: string | null
  isTest: boolean
  startedAt: string
  finishedAt: string | null
  endReason: RunEndReason | null
  error: string | null
}

export interface RunStep {
  id: string
  nodeId: string
  nodeType: string
  status: 'ok' | 'failed'
  input: unknown
  output: unknown
  error: string | null
  startedAt: string
  finishedAt: string | null
}

export interface RunDetail extends RunSummary {
  graph: FlowGraph
  steps: RunStep[]
}

export const isRunActive = (run: Pick<RunSummary, 'status'>) => run.status === 'running' || run.status === 'waiting'

export type AiVendor = 'openai' | 'anthropic' | 'gemini'

export const AI_VENDOR_LABELS: Record<AiVendor, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  gemini: 'Google Gemini',
}

export interface AiProvider {
  id: string
  name: string
  vendor: AiVendor
  keyHint: string
  availableModels: string[]
  lastTestedAt: string
  agentCount: number
}

export interface AiAgent {
  id: string
  name: string
  provider: { id: string; name: string; vendor: AiVendor }
  model: string
  instructions: string
  historySize: number
  isActive: boolean
  updatedAt: string
}

export interface AiAgentInput {
  name: string
  providerId: string
  model: string
  instructions: string
  historySize: number
}

export interface Handling {
  mode: 'automation' | 'human'
  reason: string | null
  summary: string | null
  handoffAt: string | null
  assumedBy: { id: string; name: string } | null
}

export type MessageAutomation = { kind: 'flow' | 'agent'; name: string } | null

export const isAwaitingHuman = (handling: Handling) => handling.mode === 'human' && handling.assumedBy === null

export const AGENT_INSTRUCTIONS_MAX = 8000
export const HISTORY_SIZE_MIN = 5
export const HISTORY_SIZE_MAX = 50
export const HISTORY_SIZE_DEFAULT = 20
