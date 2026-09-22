'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'

export const LOST_REASON_MAX = 200

/** Asks why a lead was lost before moving it to a "lost" stage. */
export function LostReasonDialog({
  leadName,
  stageName,
  onConfirm,
  onCancel,
}: {
  leadName: string
  stageName: string
  onConfirm: (reason: string) => void
  onCancel: () => void
}) {
  const id = useId()
  const [reason, setReason] = useState('')
  const field = useRef<HTMLTextAreaElement>(null)
  const opener = useRef<Element | null>(null)
  const trimmed = reason.trim()

  useEffect(() => {
    opener.current = document.activeElement
    field.current?.focus()
    const node = opener.current
    return () => {
      if (node instanceof HTMLElement) node.focus()
    }
  }, [])

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/50 p-4" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        onKeyDown={(e) => e.key === 'Escape' && onCancel()}
        className="w-full max-w-md bg-paper p-6 shadow-xl cut-corner [--cut:18px]"
      >
        <h2 id={`${id}-title`} className="font-display text-lg font-extrabold uppercase [font-stretch:115%]">
          Motivo da perda
        </h2>
        <p className="mt-1 text-sm text-muted">
          {leadName} vai para <strong className="text-ink">{stageName}</strong>. Registre o motivo para o histórico.
        </p>
        <form
          className="mt-5 flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (trimmed) onConfirm(trimmed)
          }}
        >
          <label htmlFor={`${id}-reason`} className="text-xs font-semibold uppercase tracking-[0.12em]">
            Motivo
          </label>
          <textarea
            id={`${id}-reason`}
            ref={field}
            value={reason}
            maxLength={LOST_REASON_MAX}
            rows={3}
            onChange={(e) => setReason(e.target.value)}
            aria-describedby={`${id}-count`}
            className="resize-none border-b-2 border-ink/20 bg-mist px-3 py-2 outline-none focus:border-brand focus:bg-paper"
          />
          <p id={`${id}-count`} className="self-end font-mono text-[11px] text-muted">
            {reason.length}/{LOST_REASON_MAX}
          </p>
          <div className="mt-2 flex justify-end gap-2">
            <Button variant="ghost" onClick={onCancel}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!trimmed}>
              Marcar como perdido
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
