'use client'

import type { ReactNode } from 'react'
import { formatDateTime } from './sources/labels'
import { Menu, type MenuItem } from './menu'

export type FrameStatus = 'ready' | 'loading' | 'error' | 'notReady' | 'empty'

export type FrameState = {
  status: FrameStatus
  errorMessage?: string
  missingFields?: string[]
  ignoredRows?: number
  staleWarning?: string | null
  /** Snapshot date; only passed for external sources. */
  dataAsOf?: string | null
  /** Editor only: fields left out after a type change. */
  pendingFields?: string[]
}

function Body({ state, children }: { state: FrameState; children: ReactNode }) {
  switch (state.status) {
    case 'loading':
      return <div aria-busy="true" aria-label="Carregando componente" className="h-full min-h-12 animate-pulse bg-mist" />
    case 'error':
      return (
        <p role="alert" className="text-sm font-semibold text-brand">
          {state.errorMessage ?? 'Não foi possível carregar os dados.'}
        </p>
      )
    case 'notReady':
      return <p className="grid h-full place-items-center text-center text-sm text-muted">Arraste campos para montar o componente</p>
    case 'empty':
      return <p className="grid h-full place-items-center text-center text-sm text-muted">Sem dados para os filtros atuais</p>
    case 'ready':
      return <>{children}</>
  }
}

/** Card around every visual: title, menu, loading/error/empty states and data notices. */
export function VisualFrame({
  title,
  menuItems,
  state,
  dragHandle = false,
  children,
}: {
  title: string
  menuItems: MenuItem[]
  state: FrameState
  dragHandle?: boolean
  children?: ReactNode
}) {
  const ignored = state.ignoredRows ?? 0
  return (
    <section aria-label={title} className="flex h-full min-h-0 flex-col border border-line bg-paper">
      <header className={`flex items-center gap-2 px-3 pt-2 ${dragHandle ? 'bi-drag-handle cursor-move' : ''}`}>
        <h3 className="min-w-0 flex-1 truncate font-display text-xs font-extrabold tracking-wider uppercase [font-stretch:110%]">{title}</h3>
        {menuItems.length > 0 && (
          <Menu label={`Opções de ${title}`} items={menuItems} className="bi-no-print grid size-7 place-items-center text-lg leading-none hover:bg-mist">
            <span aria-hidden>⋯</span>
          </Menu>
        )}
      </header>
      {state.staleWarning && <p className="mx-3 mt-1 bg-stage-amber-bg px-2 py-1 text-xs font-semibold text-stage-amber">{state.staleWarning}</p>}
      {state.missingFields?.map((field) => (
        <p key={field} className="mx-3 mt-1 bg-stage-red-bg px-2 py-1 text-xs font-semibold text-stage-red">
          O campo {field} não existe mais na fonte
        </p>
      ))}
      {state.pendingFields && state.pendingFields.length > 0 && (
        <p className="mx-3 mt-1 border-l-2 border-brand px-2 text-xs text-muted">Campos não usados: {state.pendingFields.join(', ')}</p>
      )}
      <div className="min-h-0 flex-1 px-3 py-2">
        <Body state={state}>{children}</Body>
      </div>
      {(ignored > 0 || state.dataAsOf) && (
        <footer className="flex flex-wrap justify-between gap-2 px-3 pb-1.5 font-mono text-[10px] text-muted">
          {ignored > 0 && <span>{ignored} linhas ignoradas por valores inválidos</span>}
          {state.dataAsOf && <span>Dados de {formatDateTime(state.dataAsOf)}</span>}
        </footer>
      )}
    </section>
  )
}
