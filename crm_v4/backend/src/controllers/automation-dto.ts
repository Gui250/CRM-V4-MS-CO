import type { AiAgentRow, AiProviderRow, FlowRunStepRow } from '../db/schema.js'
import type { FlowWithVersion } from '../models/flow.js'
import type { RunDetail, RunEndReason, RunWithContext } from '../models/flow-run.js'

// Response shapes of feature 003 (specs/003-automation-flows-ai-agents/contracts/openapi.yaml).
// Conversation.handling and Message.automation live in dto.ts with the rest of those DTOs.

const iso = (date: Date | null) => (date ? date.toISOString() : null)

export interface FlowSummaryDto {
  id: string
  name: string
  description: string | null
  status: FlowWithVersion['status']
  trigger: FlowWithVersion['triggerType']
  priority: number
  versionNumber: number | null
  updatedAt: string
  lastRunAt: string | null
}

export interface FlowDto extends FlowSummaryDto {
  graph: unknown
}

export function toFlowSummaryDto(flow: FlowWithVersion): FlowSummaryDto {
  return {
    id: flow.id,
    name: flow.name,
    description: flow.description,
    status: flow.status,
    trigger: flow.triggerType,
    priority: flow.priority,
    versionNumber: flow.versionNumber,
    updatedAt: flow.updatedAt.toISOString(),
    lastRunAt: iso(flow.lastRunAt),
  }
}

export const toFlowDto = (flow: FlowWithVersion): FlowDto => ({ ...toFlowSummaryDto(flow), graph: flow.graph ?? null })

export interface RunSummaryDto {
  id: string
  flowId: string
  flowName: string
  versionNumber: number
  conversationId: string
  contact: { name: string | null; phone: string }
  origin: RunWithContext['origin']
  status: RunWithContext['status']
  currentNodeId: string | null
  isTest: boolean
  startedAt: string
  finishedAt: string | null
  endReason: RunEndReason | null
  error: string | null
}

export function toRunSummaryDto(run: RunWithContext): RunSummaryDto {
  return {
    id: run.id,
    flowId: run.flowId,
    flowName: run.flowName,
    versionNumber: run.versionNumber,
    conversationId: run.conversationId,
    contact: run.contact,
    origin: run.origin,
    status: run.status,
    currentNodeId: run.currentNodeId,
    isTest: run.origin === 'test',
    startedAt: run.startedAt.toISOString(),
    finishedAt: iso(run.finishedAt),
    endReason: run.endReason as RunEndReason | null,
    error: run.error,
  }
}

export interface RunStepDto {
  id: string
  nodeId: string
  nodeType: string
  status: FlowRunStepRow['status']
  input: unknown
  output: unknown
  error: string | null
  startedAt: string
  finishedAt: string | null
}

export interface RunDetailDto extends RunSummaryDto {
  graph: unknown
  steps: RunStepDto[]
}

export function toRunDetailDto(run: RunDetail): RunDetailDto {
  return {
    ...toRunSummaryDto(run),
    graph: run.graph,
    steps: run.steps.map((step) => ({
      id: step.id,
      nodeId: step.nodeId,
      nodeType: step.nodeType,
      status: step.status,
      input: step.input,
      output: step.output,
      error: step.error,
      startedAt: step.startedAt.toISOString(),
      finishedAt: iso(step.finishedAt),
    })),
  }
}

export interface AiProviderDto {
  id: string
  name: string
  vendor: AiProviderRow['vendor']
  keyHint: string
  availableModels: string[]
  lastTestedAt: string
  agentCount: number
}

/** Never includes key material: only the hint (FR-015). */
export function toAiProviderDto(provider: AiProviderRow & { agentCount: number }): AiProviderDto {
  return {
    id: provider.id,
    name: provider.name,
    vendor: provider.vendor,
    keyHint: provider.keyHint,
    availableModels: provider.availableModels,
    lastTestedAt: provider.lastTestedAt.toISOString(),
    agentCount: provider.agentCount,
  }
}

export interface AiAgentDto {
  id: string
  name: string
  provider: { id: string; name: string; vendor: AiProviderRow['vendor'] }
  model: string
  instructions: string
  historySize: number
  isActive: boolean
  updatedAt: string
}

export function toAiAgentDto(agent: AiAgentRow & { provider: Pick<AiProviderRow, 'id' | 'name' | 'vendor'> }): AiAgentDto {
  return {
    id: agent.id,
    name: agent.name,
    provider: { id: agent.provider.id, name: agent.provider.name, vendor: agent.provider.vendor },
    model: agent.model,
    instructions: agent.instructions,
    historySize: agent.historySize,
    isActive: agent.isActive,
    updatedAt: agent.updatedAt.toISOString(),
  }
}
