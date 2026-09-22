import type { MessageAutomation } from '@/lib/automation-types'

export function AutomationLabel({ automation }: { automation: MessageAutomation }) {
  if (!automation) return null
  return (
    <p className="font-mono text-[11px] font-semibold uppercase tracking-wide text-muted">
      {automation.kind === 'agent' ? 'IA' : 'Automação'}: {automation.name}
    </p>
  )
}
