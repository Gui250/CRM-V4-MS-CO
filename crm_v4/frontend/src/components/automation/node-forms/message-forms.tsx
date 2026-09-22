'use client'

import { useRef, useState } from 'react'
import { ACCEPTED_FILES } from '@/components/chat/composer'
import { ApiError } from '@/lib/api'
import type { NodeConfigs } from '@/lib/automation-types'
import { useUploadFlowAsset } from '@/lib/use-automation'
import { FieldError, TextAreaField } from './fields'

const TEXT_MAX = 4096
const CAPTION_MAX = 1024

export const VARIABLES = [
  { token: '{{contato.primeiro_nome}}', label: 'Primeiro nome' },
  { token: '{{contato.nome}}', label: 'Nome' },
  { token: '{{contato.telefone}}', label: 'Telefone' },
]

type TextConfig = NodeConfigs['send_text']

export function SendTextForm({ config, onChange }: { config: TextConfig; onChange: (c: TextConfig) => void }) {
  const area = useRef<HTMLTextAreaElement>(null)

  function insert(token: string) {
    const el = area.current
    const start = el?.selectionStart ?? config.text.length
    const end = el?.selectionEnd ?? config.text.length
    onChange({ text: config.text.slice(0, start) + token + config.text.slice(end) })
  }

  return (
    <div className="flex flex-col gap-2">
      <TextAreaField
        ref={area}
        label="Mensagem"
        max={TEXT_MAX}
        value={config.text}
        onChange={(e) => onChange({ text: e.target.value })}
        error={config.text.trim() ? undefined : 'Escreva a mensagem.'}
      />
      <div className="flex flex-wrap gap-1.5" aria-label="Inserir variável">
        {VARIABLES.map((v) => (
          <button key={v.token} type="button" onClick={() => insert(v.token)} className="bg-mist px-2 py-1 font-mono text-[11px] hover:bg-line">
            + {v.label}
          </button>
        ))}
      </div>
    </div>
  )
}

type MediaConfig = NodeConfigs['send_media']

export function SendMediaForm({ config, onChange }: { config: MediaConfig; onChange: (c: MediaConfig) => void }) {
  const upload = useUploadFlowAsset()
  const [error, setError] = useState<string | null>(null)

  function pick(file: File | undefined) {
    if (!file) return
    setError(null)
    upload.mutate(file, {
      onSuccess: (asset) => onChange({ ...config, mediaPath: asset.mediaPath, mime: asset.mime, filename: asset.filename }),
      onError: (err) => setError(err instanceof ApiError ? err.message : 'Não foi possível enviar o arquivo.'),
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm">{config.filename ? <span className="font-semibold">{config.filename}</span> : <span className="text-muted">Nenhum arquivo escolhido.</span>}</p>
      <input type="file" aria-label="Arquivo" accept={ACCEPTED_FILES} onChange={(e) => pick(e.target.files?.[0])} disabled={upload.isPending} className="text-sm" />
      {upload.isPending && <p className="text-xs text-muted">Enviando…</p>}
      {error && <FieldError>{error}</FieldError>}
      <TextAreaField
        label="Legenda (opcional)"
        max={CAPTION_MAX}
        value={config.caption ?? ''}
        onChange={(e) => onChange({ ...config, caption: e.target.value || undefined })}
      />
    </div>
  )
}
