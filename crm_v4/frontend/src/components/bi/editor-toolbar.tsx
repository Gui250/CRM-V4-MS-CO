'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import type { Source } from '@/lib/bi/types'

const TOOL = 'h-9 border border-ink/80 px-3 text-sm font-semibold hover:bg-mist disabled:border-line disabled:text-muted disabled:hover:bg-transparent'

type Props = {
  name: string
  onRename: (name: string) => void
  sources: Source[]
  sourceId: string | undefined
  onPickSource: (sourceId: string) => void
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  onSuggest: () => void
  isSuggesting: boolean
  onPreview: () => void
  onShare?: () => void
  exportMenu: ReactNode
  onSave: () => void
  isSaving: boolean
  isDirty: boolean
}

export function EditorToolbar(props: Props) {
  return (
    <div className="bi-no-print flex flex-wrap items-center gap-2 border-b border-line bg-paper px-4 py-2">
      <Link href="/relatorios" className="font-mono text-xs font-bold tracking-wider text-muted uppercase hover:text-brand">
        ← Relatórios
      </Link>
      <input
        aria-label="Nome do relatório"
        value={props.name}
        maxLength={100}
        onChange={(e) => props.onRename(e.target.value)}
        className="h-9 min-w-40 flex-1 border-b-2 border-transparent bg-transparent px-1 font-display text-lg font-extrabold uppercase outline-none [font-stretch:112%] hover:border-ink/20 focus:border-brand"
      />
      <label className="flex items-center gap-2 text-xs font-semibold tracking-wider uppercase">
        Fonte
        <select
          aria-label="Fonte de dados"
          value={props.sourceId ?? ''}
          onChange={(e) => props.onPickSource(e.target.value)}
          className="h-9 max-w-48 border-b-2 border-ink/20 bg-mist px-2 text-sm tracking-normal normal-case outline-none focus:border-brand"
        >
          {props.sources.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <div className="flex">
        <button type="button" onClick={props.onUndo} disabled={!props.canUndo} title="Ctrl+Z" className={TOOL}>
          Desfazer
        </button>
        <button type="button" onClick={props.onRedo} disabled={!props.canRedo} title="Ctrl+Shift+Z" className={`${TOOL} -ml-px`}>
          Refazer
        </button>
      </div>
      <button type="button" onClick={props.onSuggest} disabled={!props.sourceId || props.isSuggesting} className={TOOL}>
        Gerar relatório sugerido
      </button>
      <button type="button" onClick={props.onPreview} className={TOOL}>
        Visualizar
      </button>
      {props.onShare && (
        <button type="button" onClick={props.onShare} className={TOOL}>
          Compartilhar
        </button>
      )}
      {props.exportMenu}
      <Button onClick={props.onSave} disabled={props.isSaving} className="h-9 cut-corner [--cut:8px]">
        {props.isSaving ? 'Salvando…' : props.isDirty ? 'Salvar' : 'Salvo'}
      </Button>
    </div>
  )
}
