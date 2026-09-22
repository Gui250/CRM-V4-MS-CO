'use client'

import { useMemo, useSyncExternalStore } from 'react'

export const MD_WIDTH = 768 // Tailwind `md`
export const LG_WIDTH = 1024 // Tailwind `lg`

const subscribe = (minWidth: number) => (onChange: () => void) => {
  if (typeof window.matchMedia !== 'function') return () => undefined
  const query = window.matchMedia(`(min-width: ${minWidth}px)`)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

/** True from `minWidth` (default `md`) up; environments without matchMedia count as desktop. */
export const useIsDesktop = (minWidth = MD_WIDTH) =>
  useSyncExternalStore(
    useMemo(() => subscribe(minWidth), [minWidth]),
    () => typeof window.matchMedia !== 'function' || window.matchMedia(`(min-width: ${minWidth}px)`).matches,
    () => true,
  )
