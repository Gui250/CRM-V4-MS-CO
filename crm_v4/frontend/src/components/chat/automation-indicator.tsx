'use client'

import { ApiError } from '@/lib/api'
import { isRunActive } from '@/lib/automation-types'
import { useCancelRun, useConversationRuns } from '@/lib/use-automation'

export function AutomationIndicator({ conversationId }: { conversationId: string }) {
  const { data: runs = [] } = useConversationRuns(conversationId)
  const cancel = useCancelRun()
  const run = runs[0]
  if (!run || !isRunActive(run)) return null

  return (
    <div role="status" className="flex items-center gap-3 border-b border-line bg-mist px-4 py-2 text-sm">
      <span aria-hidden className="size-2 animate-pulse bg-brand" />
      <span className="flex-1">
        {run.status === 'waiting' ? 'Automação aguardando' : 'Automação em andamento'}: <strong>{run.flowName}</strong>
      </span>
      {cancel.error && <span className="text-brand">{cancel.error instanceof ApiError ? cancel.error.message : 'Não foi possível parar.'}</span>}
      <button type="button" onClick={() => cancel.mutate(run.id)} disabled={cancel.isPending} className="text-xs font-semibold text-brand disabled:opacity-50">
        Parar
      </button>
    </div>
  )
}
