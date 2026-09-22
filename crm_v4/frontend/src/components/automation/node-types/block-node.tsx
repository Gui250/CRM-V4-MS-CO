'use client'

import { Handle, type NodeProps, type NodeTypes, Position } from '@xyflow/react'
import type { FlowNode, NodeConfigs, NodeType } from '@/lib/automation-types'
import { useAiAgents } from '@/lib/use-automation'
import { type EditorNode, isTriggerType, OUTPUTS } from '../graph-convert'
import { NODE_LABELS, OUTPUT_LABELS } from '../node-defaults'
import { summarize } from './summary'

const HIGHLIGHT_CLASSES = {
  current: 'border-brand ring-4 ring-brand/30',
  visited: 'border-ink',
  failed: 'border-brand bg-brand/5',
}

function AgentName({ agentId }: { agentId: string }) {
  const { data: agents = [] } = useAiAgents()
  const agent = agents.find((a) => a.id === agentId)
  if (!agent) return <p className="text-xs text-brand">Escolha um agente</p>
  return <p className="text-xs font-semibold">{agent.isActive ? agent.name : `${agent.name} (desativado)`}</p>
}

function Outputs({ type }: { type: NodeType }) {
  const outputs = OUTPUTS[type]
  return (
    <>
      {outputs.length > 0 && (
        <div className="mt-2 flex justify-around gap-2 text-[10px] font-semibold uppercase tracking-wide text-muted">
          {outputs.map((o) => (
            <span key={o}>{OUTPUT_LABELS[o]}</span>
          ))}
        </div>
      )}
      {outputs.map((o, i) => (
        <Handle
          key={o}
          id={o}
          type="source"
          position={Position.Bottom}
          style={{ left: `${((i + 1) * 100) / (outputs.length + 1)}%` }}
          className="!h-3 !w-3 !rounded-none !border-0 !bg-ink"
        />
      ))}
    </>
  )
}

/** Every block type renders through this one component; only title, summary and outputs differ. */
export function BlockNode({ type, data, selected }: NodeProps<EditorNode>) {
  const node = { type, config: data.config } as FlowNode
  const border = data.highlight ? HIGHLIGHT_CLASSES[data.highlight] : selected ? 'border-brand' : data.issues.length ? 'border-brand' : 'border-ink/30'
  return (
    <div className={`w-56 border-2 bg-paper px-3 py-2 text-ink shadow-sm ${border}`} data-testid={`block-${type}`}>
      {!isTriggerType(type) && <Handle type="target" position={Position.Top} className="!h-3 !w-3 !rounded-none !border-0 !bg-ink" />}
      <p className="font-display text-xs font-extrabold uppercase tracking-wide">{NODE_LABELS[type]}</p>
      {type === 'ai_agent' && <AgentName agentId={(data.config as NodeConfigs['ai_agent']).agentId} />}
      <p className="text-xs text-muted">{summarize(node)}</p>
      {data.issues.length > 0 && (
        <ul className="mt-1 text-xs text-brand">
          {data.issues.map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
      )}
      <Outputs type={type} />
    </div>
  )
}

export const nodeTypes = Object.fromEntries(Object.keys(NODE_LABELS).map((type) => [type, BlockNode])) as NodeTypes
