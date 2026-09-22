'use client'

import type { FlowNode, NodeConfigs } from '@/lib/automation-types'
import { NODE_LABELS } from './node-defaults'
import { AgentForm, ConditionForm, HandoffForm, WaitForm, WaitReplyForm } from './node-forms/logic-forms'
import { SendMediaForm, SendTextForm } from './node-forms/message-forms'
import { ManualTriggerInfo, MessageTriggerForm } from './node-forms/trigger-form'

type AnyConfig = NodeConfigs[keyof NodeConfigs]

function NodeForm({ node, onChange }: { node: FlowNode; onChange: (config: AnyConfig) => void }) {
  switch (node.type) {
    case 'trigger.message_received':
      return <MessageTriggerForm key={node.id} config={node.config} onChange={onChange} />
    case 'trigger.manual':
      return <ManualTriggerInfo />
    case 'send_text':
      return <SendTextForm config={node.config} onChange={onChange} />
    case 'send_media':
      return <SendMediaForm config={node.config} onChange={onChange} />
    case 'wait':
      return <WaitForm config={node.config} onChange={onChange} />
    case 'wait_reply':
      return <WaitReplyForm config={node.config} onChange={onChange} />
    case 'condition':
      return <ConditionForm config={node.config} onChange={onChange} />
    case 'ai_agent':
      return <AgentForm config={node.config} onChange={onChange} />
    case 'handoff':
      return <HandoffForm config={node.config} onChange={onChange} />
    case 'end':
      return <p className="text-sm text-muted">A execução termina aqui. Saídas sem conexão também encerram o fluxo.</p>
  }
}

export function NodeConfigPanel({ node, onChange, issues = [] }: { node: FlowNode; onChange: (config: AnyConfig) => void; issues?: string[] }) {
  return (
    <section aria-label={`Configurar ${NODE_LABELS[node.type]}`} className="flex flex-col gap-4 p-4">
      <h2 className="font-display text-lg font-extrabold uppercase">{NODE_LABELS[node.type]}</h2>
      {issues.length > 0 && (
        <ul role="alert" className="flex flex-col gap-1 border-l-4 border-brand bg-brand/5 px-3 py-2 text-sm">
          {issues.map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
      )}
      <NodeForm node={node} onChange={onChange} />
    </section>
  )
}
