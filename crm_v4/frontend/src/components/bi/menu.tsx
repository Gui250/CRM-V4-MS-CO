'use client'

import { useEffect, useId, useRef, useState, type ReactNode } from 'react'

export type MenuItem = { label: string; onSelect: () => void; disabled?: boolean }

const ITEM = '[role="menuitem"]:not(:disabled)'

/** Button + popup menu (keyboard: arrows move, Escape closes and returns focus to the button). */
export function Menu({
  label,
  items,
  children,
  className = '',
}: {
  label: string
  items: MenuItem[]
  children: ReactNode
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const root = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    root.current?.querySelector<HTMLElement>(ITEM)?.focus()
    const closeOutside = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', closeOutside)
    return () => document.removeEventListener('mousedown', closeOutside)
  }, [open])

  const dismiss = () => {
    setOpen(false)
    button.current?.focus()
  }

  function moveFocus(step: number) {
    const options = [...(root.current?.querySelectorAll<HTMLElement>(ITEM) ?? [])]
    const current = options.indexOf(document.activeElement as HTMLElement)
    options[(current + step + options.length) % options.length]?.focus()
  }

  return (
    <div ref={root} className="relative inline-flex">
      <button
        ref={button}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen((value) => !value)}
        className={className}
      >
        {children}
      </button>
      {open && (
        <div
          id={id}
          role="menu"
          aria-label={label}
          onKeyDown={(e) => {
            if (e.key === 'Escape') dismiss()
            else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault()
              moveFocus(e.key === 'ArrowDown' ? 1 : -1)
            }
          }}
          className="absolute top-full right-0 z-40 mt-1 flex min-w-44 flex-col border border-ink/80 bg-paper py-1 shadow-lg"
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                dismiss()
                item.onSelect()
              }}
              className="px-3 py-2 text-left text-sm font-semibold whitespace-nowrap text-ink hover:bg-mist focus:bg-mist focus:outline-none disabled:text-muted disabled:hover:bg-transparent"
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
