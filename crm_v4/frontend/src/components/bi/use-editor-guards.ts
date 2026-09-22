'use client'

import { useEffect } from 'react'

export const UNSAVED_MESSAGE = 'Há alterações não salvas. Sair mesmo assim?'

/** Warns before leaving with unsaved changes: tab close/reload and clicks on in-app links (FR-009). */
export function useUnsavedGuard(isDirty: boolean) {
  useEffect(() => {
    if (!isDirty) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault()
    // Capture phase on document runs before React's root listener, so Next's <Link> never navigates.
    const onClick = (e: MouseEvent) => {
      const link = e.target instanceof Element ? e.target.closest('a[href]') : null
      if (!link || link.hasAttribute('download') || link.getAttribute('target') === '_blank') return
      if (window.confirm(UNSAVED_MESSAGE)) return
      e.preventDefault()
      e.stopPropagation()
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    document.addEventListener('click', onClick, true)
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload)
      document.removeEventListener('click', onClick, true)
    }
  }, [isDirty])
}

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))

/** Ctrl/⌘+Z undoes, Ctrl/⌘+Shift+Z (or Ctrl+Y) redoes; text fields keep their native undo. */
export function useUndoShortcuts(undo: () => void, redo: () => void) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || isTyping(e.target)) return
      const key = e.key.toLowerCase()
      if (key === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
      } else if (key === 'y') {
        e.preventDefault()
        redo()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [undo, redo])
}
