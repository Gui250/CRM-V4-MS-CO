'use client'

import { useState } from 'react'
import { MAX_PAGES, type ReportPage } from '@/lib/bi/types'
import { Menu } from './menu'

const PAGE_MIME = 'application/x-bi-page'

export type PageEditing = {
  onAdd: () => void
  onRename: (pageId: string, name: string) => void
  onMove: (pageId: string, toIndex: number) => void
  onRemove: (pageId: string) => void
}

function RenameInput({ page, onDone }: { page: ReportPage; onDone: (name: string | null) => void }) {
  const [name, setName] = useState(page.name)
  const commit = () => onDone(name.trim() && name.trim() !== page.name ? name.trim() : null)
  return (
    <input
      autoFocus
      aria-label="Nome da página"
      value={name}
      maxLength={60}
      onChange={(e) => setName(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit()
        if (e.key === 'Escape') onDone(null)
      }}
      className="h-9 w-36 border-b-2 border-brand bg-mist px-2 text-sm outline-none"
    />
  )
}

/** Report pages as tabs; with `editing`: add, rename inline, reorder (drag or menu) and delete. */
export function PageTabs({
  pages,
  currentPageId,
  onSelect,
  editing,
}: {
  pages: ReportPage[]
  currentPageId: string
  onSelect: (pageId: string) => void
  editing?: PageEditing
}) {
  const [renaming, setRenaming] = useState<string | null>(null)

  const remove = (page: ReportPage) => {
    if (window.confirm(`Excluir a página "${page.name}" e seus componentes?`)) editing?.onRemove(page.id)
  }

  return (
    <div className="bi-no-print flex items-end gap-1 overflow-x-auto border-b border-line bg-paper px-4">
      <div role="tablist" aria-label="Páginas do relatório" className="flex items-end gap-1">
        {pages.map((page, index) => {
          const selected = page.id === currentPageId
          if (renaming === page.id && editing) {
            return (
              <RenameInput
                key={page.id}
                page={page}
                onDone={(name) => {
                  if (name) editing.onRename(page.id, name)
                  setRenaming(null)
                }}
              />
            )
          }
          return (
            <div
              key={page.id}
              draggable={!!editing}
              onDragStart={(e) => e.dataTransfer.setData(PAGE_MIME, page.id)}
              onDragOver={(e) => editing && [...e.dataTransfer.types].includes(PAGE_MIME) && e.preventDefault()}
              onDrop={(e) => {
                const id = e.dataTransfer.getData(PAGE_MIME)
                if (id && editing) editing.onMove(id, index)
              }}
              className={`flex items-center border-b-2 ${selected ? 'border-brand' : 'border-transparent'}`}
            >
              <button
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => onSelect(page.id)}
                onDoubleClick={() => editing && setRenaming(page.id)}
                className={`h-9 px-3 text-sm font-semibold whitespace-nowrap ${selected ? 'text-ink' : 'text-muted hover:text-ink'}`}
              >
                {page.name}
              </button>
              {editing && selected && (
                <Menu
                  label={`Opções da página ${page.name}`}
                  className="grid h-9 w-6 place-items-center hover:bg-mist"
                  items={[
                    { label: 'Renomear', onSelect: () => setRenaming(page.id) },
                    { label: 'Mover para esquerda', onSelect: () => editing.onMove(page.id, index - 1), disabled: index === 0 },
                    { label: 'Mover para direita', onSelect: () => editing.onMove(page.id, index + 1), disabled: index === pages.length - 1 },
                    { label: 'Excluir', onSelect: () => remove(page), disabled: pages.length <= 1 },
                  ]}
                >
                  <span aria-hidden>▾</span>
                </Menu>
              )}
            </div>
          )
        })}
      </div>
      {editing && (
        <button
          type="button"
          onClick={editing.onAdd}
          disabled={pages.length >= MAX_PAGES}
          className="mb-1 h-8 px-2 text-sm font-semibold text-brand hover:bg-mist disabled:text-muted"
        >
          + Nova página
        </button>
      )}
    </div>
  )
}
