'use client'

import { useState } from 'react'
import type { NodeConfigs } from '@/lib/automation-types'
import { FieldError, TextAreaField } from './fields'

type Config = NodeConfigs['trigger.message_received']

const MATCHES: { value: Config['match']; label: string }[] = [
  { value: 'first_message', label: 'Primeira mensagem de um contato novo' },
  { value: 'any', label: 'Qualquer mensagem' },
  { value: 'keyword', label: 'Mensagem com palavra-chave' },
]

const KEYWORDS_MAX = 20
const KEYWORD_LENGTH_MAX = 50

export const parseKeywords = (text: string) =>
  text
    .split(/[,\n]/)
    .map((k) => k.trim())
    .filter(Boolean)

export function keywordsProblem(keywords: string[]): string | null {
  if (keywords.length === 0) return 'Informe pelo menos uma palavra-chave.'
  if (keywords.length > KEYWORDS_MAX) return `Use no máximo ${KEYWORDS_MAX} palavras-chave.`
  if (keywords.some((k) => k.length > KEYWORD_LENGTH_MAX)) return `Cada palavra-chave pode ter até ${KEYWORD_LENGTH_MAX} caracteres.`
  return null
}

export function MessageTriggerForm({ config, onChange }: { config: Config; onChange: (c: Config) => void }) {
  const [keywordsText, setKeywordsText] = useState((config.keywords ?? []).join(', '))
  const keywords = parseKeywords(keywordsText)

  function setMatch(match: Config['match']) {
    onChange(match === 'keyword' ? { match, keywords } : { match })
  }

  return (
    <div className="flex flex-col gap-4">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 text-xs font-semibold uppercase tracking-[0.12em]">Quando começar</legend>
        {MATCHES.map((m) => (
          <label key={m.value} className="flex items-center gap-2 text-sm">
            <input type="radio" name="match" checked={config.match === m.value} onChange={() => setMatch(m.value)} className="accent-brand" />
            {m.label}
          </label>
        ))}
      </fieldset>
      {config.match === 'keyword' && (
        <div className="flex flex-col gap-1">
          <TextAreaField
            label="Palavras-chave"
            max={KEYWORDS_MAX * (KEYWORD_LENGTH_MAX + 2)}
            value={keywordsText}
            placeholder="preço, orçamento"
            onChange={(e) => {
              setKeywordsText(e.target.value)
              onChange({ match: 'keyword', keywords: parseKeywords(e.target.value) })
            }}
          />
          <p className="text-xs text-muted">Separe por vírgula ou uma por linha. Maiúsculas e acentos são ignorados.</p>
          {keywordsProblem(keywords) && <FieldError>{keywordsProblem(keywords)}</FieldError>}
        </div>
      )}
    </div>
  )
}

export function ManualTriggerInfo() {
  return <p className="text-sm text-muted">Este fluxo começa quando um atendente o dispara pelo menu Automações de uma conversa.</p>
}
