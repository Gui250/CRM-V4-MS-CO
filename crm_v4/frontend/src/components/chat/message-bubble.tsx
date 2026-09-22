'use client'

import { useMutation } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'
import { formatTime } from '@/lib/format'
import { reportError } from '@/lib/logger'
import type { Message, MessageStatus } from '@/lib/types'
import { AutomationLabel } from './automation-label'
import { MediaContent } from './media-content'

const STATUS_LABEL: Record<MessageStatus, string> = {
  pending: 'Enviando',
  sent: 'Enviada',
  delivered: 'Entregue',
  read: 'Lida',
  failed: 'Falhou',
}

function StatusMark({ status }: { status: MessageStatus }) {
  const glyph = status === 'pending' ? '◷' : status === 'sent' ? '✓' : '✓✓'
  return (
    <span aria-label={STATUS_LABEL[status]} title={STATUS_LABEL[status]} className={status === 'read' ? 'font-bold text-white' : 'text-white/70'}>
      {glyph}
    </span>
  )
}

export function MessageBubble({ message, onRetried }: { message: Message; onRetried?: (message: Message) => void }) {
  const outbound = message.direction === 'outbound'
  const retry = useMutation({
    mutationFn: () => apiFetch<Message>(`/api/messages/${message.id}/retry`, { method: 'POST' }),
    onSuccess: (updated) => onRetried?.(updated),
    onError: (error) => reportError(error, 'retry message'),
  })

  const bubble = outbound
    ? 'bg-brand text-white cut-corner [--cut:10px]'
    : 'bg-paper text-ink border border-line cut-corner-bl [--cut:8px]'

  return (
    <div className={`flex flex-col ${outbound ? 'items-end' : 'items-start'}`}>
      {outbound && message.sentBy && <span className="mb-1 px-1 font-mono text-[11px] text-muted">{message.sentBy.name}</span>}
      {outbound && message.automation && (
        <div className="mb-1 px-1">
          <AutomationLabel automation={message.automation} />
        </div>
      )}
      <div className={`max-w-[min(34rem,85%)] px-3.5 py-2 ${bubble}`}>
        {message.type === 'unsupported' ? (
          <p className="text-sm italic">Tipo de mensagem não suportado</p>
        ) : message.type === 'text' ? (
          <p className="text-[15px] leading-snug break-words whitespace-pre-wrap">{message.body}</p>
        ) : (
          <div className="flex flex-col gap-2">
            <MediaContent message={message} />
            {message.body && <p className="text-[15px] leading-snug break-words whitespace-pre-wrap">{message.body}</p>}
          </div>
        )}
        <p className={`mt-1 flex items-center justify-end gap-1.5 font-mono text-[10.5px] ${outbound ? 'text-white/75' : 'text-muted'}`}>
          <time dateTime={message.sentAt}>{formatTime(message.sentAt)}</time>
          {outbound && message.status && message.status !== 'failed' && <StatusMark status={message.status} />}
        </p>
      </div>
      {message.status === 'failed' && (
        <p className="mt-1 flex items-center gap-2 text-xs text-brand">
          <span>Falhou</span>
          <span aria-hidden>·</span>
          <button onClick={() => retry.mutate()} disabled={retry.isPending} className="font-semibold underline underline-offset-2">
            {retry.isPending ? 'Reenviando…' : 'Reenviar'}
          </button>
        </p>
      )}
    </div>
  )
}
