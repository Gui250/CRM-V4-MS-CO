'use client'

import { useSyncExternalStore } from 'react'

const DESKTOP = '(min-width: 768px)' // Tailwind `md`

const subscribe = (onChange: () => void) => {
  if (typeof window.matchMedia !== 'function') return () => undefined
  const query = window.matchMedia(DESKTOP)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

/** True from the `md` breakpoint up; environments without matchMedia count as desktop. */
export const useIsDesktop = () =>
  useSyncExternalStore(
    subscribe,
    () => typeof window.matchMedia !== 'function' || window.matchMedia(DESKTOP).matches,
    () => true,
  )
