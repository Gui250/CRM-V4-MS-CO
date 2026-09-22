'use client'

import { useEffect, useId, useRef, type ReactNode } from 'react'

const FOCUSABLE = ':is(input, select, textarea, button):not(:disabled), [href], [tabindex]:not([tabindex="-1"])'

/** Native modal `<dialog>`: mounted = open. Focus goes back to the control that opened it on close. */
export function ModalDialog({
  title,
  onClose,
  children,
  className = 'max-w-md',
}: {
  title: string
  onClose: () => void
  children: ReactNode
  className?: string
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    const dialog = ref.current!
    const opener = document.activeElement
    // jsdom (tests) has no showModal; the `open` attribute renders the same content.
    if (typeof dialog.showModal === 'function') dialog.showModal()
    else dialog.setAttribute('open', '')
    if (!dialog.contains(document.activeElement)) dialog.querySelector<HTMLElement>(FOCUSABLE)?.focus()
    return () => {
      if (opener instanceof HTMLElement) opener.focus()
    }
  }, [])

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose()
      }}
      className={`m-auto w-full bg-paper p-6 text-ink shadow-xl cut-corner [--cut:18px] backdrop:bg-ink/50 ${className}`}
    >
      <h2 id={titleId} className="font-display text-lg font-extrabold uppercase [font-stretch:115%]">
        {title}
      </h2>
      <div className="mt-4">{children}</div>
    </dialog>
  )
}
