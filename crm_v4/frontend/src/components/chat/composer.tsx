'use client'

import { useMutation } from '@tanstack/react-query'
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { ApiError, apiFetch } from '@/lib/api'
import { formatBytes } from '@/lib/format'
import type { Message } from '@/lib/types'

export const TEXT_MAX = 4096
const CAPTION_MAX = 1024
const IMAGE_MAX_BYTES = 16 * 1024 * 1024
const DOCUMENT_MAX_BYTES = 100 * 1024 * 1024
export const ACCEPTED_FILES = 'image/jpeg,image/png,image/webp,image/gif,application/pdf,.doc,.docx,.xls,.xlsx,.txt,.zip'

const draftKey = (conversationId: string) => `v4:draft:${conversationId}`

// Storage can be unavailable (private mode, blocked site data); drafts are a convenience only.
function readDraft(conversationId: string) {
  try {
    return sessionStorage.getItem(draftKey(conversationId)) ?? ''
  } catch {
    return ''
  }
}
function writeDraft(conversationId: string, text: string) {
  try {
    if (text) sessionStorage.setItem(draftKey(conversationId), text)
    else sessionStorage.removeItem(draftKey(conversationId))
  } catch {
    // ignore
  }
}

export function fileProblem(file: File): string | null {
  const max = file.type.startsWith('image/') ? IMAGE_MAX_BYTES : DOCUMENT_MAX_BYTES
  if (file.size > max) return `Arquivo acima do limite de ${formatBytes(max)}.`
  return null
}

export function Composer({
  conversationId,
  disabled,
  onSent,
}: {
  conversationId: string
  disabled: boolean
  onSent: (message: Message) => void
}) {
  const [text, setText] = useState(() => readDraft(conversationId))
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => writeDraft(conversationId, text), [conversationId, text])

  const send = useMutation({
    mutationFn: (payload: { text: string; file: File | null }) => {
      const path = `/api/conversations/${conversationId}/messages`
      if (!payload.file) return apiFetch<Message>(path, { method: 'POST', json: { text: payload.text } })
      const form = new FormData()
      if (payload.text) form.append('caption', payload.text.slice(0, CAPTION_MAX))
      form.append('file', payload.file)
      return apiFetch<Message>(path, { method: 'POST', body: form })
    },
    onSuccess: (message) => {
      setText('')
      setFile(null)
      onSent(message)
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Não foi possível enviar. Tente novamente.'),
  })

  const trimmed = text.trim()
  const tooLong = trimmed.length > (file ? CAPTION_MAX : TEXT_MAX)
  const canSend = !disabled && !send.isPending && !tooLong && (trimmed.length > 0 || file !== null)

  function submit(event?: FormEvent) {
    event?.preventDefault()
    if (!canSend) return
    setError(null)
    send.mutate({ text: trimmed, file })
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      submit()
    }
  }

  function pickFile(picked: File | undefined) {
    if (fileInput.current) fileInput.current.value = ''
    if (!picked) return
    const problem = fileProblem(picked)
    setError(problem)
    setFile(problem ? null : picked)
  }

  return (
    <form onSubmit={submit} className="border-t border-line bg-paper px-3 py-3 md:px-5">
      {disabled && <p className="mb-2 text-xs text-muted">Conecte o WhatsApp para enviar mensagens.</p>}
      {file && (
        <div className="mb-2 flex items-center justify-between gap-3 bg-mist px-3 py-2 text-sm">
          <span className="truncate">
            <span className="font-semibold">{file.name}</span> <span className="font-mono text-xs text-muted">{formatBytes(file.size)}</span>
          </span>
          <button type="button" onClick={() => setFile(null)} className="text-xs font-semibold text-brand">
            Remover
          </button>
        </div>
      )}
      {(error || tooLong) && (
        <p role="alert" className="mb-2 text-sm text-brand">
          {tooLong ? `Limite de ${file ? CAPTION_MAX : TEXT_MAX} caracteres.` : error}
        </p>
      )}
      <div className="flex items-end gap-2">
        <input ref={fileInput} type="file" aria-label="Anexar arquivo" accept={ACCEPTED_FILES} className="peer sr-only" id={`file-${conversationId}`} onChange={(e) => pickFile(e.target.files?.[0])} disabled={disabled} />
        <label
          htmlFor={`file-${conversationId}`}
          aria-hidden
          title="Anexar arquivo"
          className={`grid size-11 shrink-0 cursor-pointer place-items-center border border-line text-lg text-ink hover:bg-mist peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand ${disabled ? 'pointer-events-none opacity-40' : ''}`}
        >
          <span aria-hidden>＋</span>
        </label>
        <textarea
          aria-label={file ? 'Legenda' : 'Mensagem'}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={disabled}
          rows={1}
          placeholder={file ? 'Legenda (opcional)' : 'Escreva uma mensagem'}
          className="max-h-40 min-h-11 flex-1 resize-none border-b-2 border-ink/15 bg-mist px-3 py-2.5 text-[15px] outline-none field-sizing-content focus:border-brand focus:bg-paper disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!canSend}
          className="h-11 shrink-0 bg-brand px-5 text-sm font-semibold text-white cut-corner [--cut:8px] hover:bg-brand-dark disabled:bg-brand/40"
        >
          {send.isPending ? 'Enviando…' : 'Enviar'}
        </button>
      </div>
    </form>
  )
}
