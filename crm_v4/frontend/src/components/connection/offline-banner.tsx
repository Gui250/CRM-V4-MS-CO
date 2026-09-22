'use client'

import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useSyncExternalStore } from 'react'
import { invalidateLiveData } from '@/lib/use-events'

function subscribe(onChange: () => void) {
  window.addEventListener('online', onChange)
  window.addEventListener('offline', onChange)
  return () => {
    window.removeEventListener('online', onChange)
    window.removeEventListener('offline', onChange)
  }
}

export function OfflineBanner() {
  const queryClient = useQueryClient()
  const online = useSyncExternalStore(subscribe, () => navigator.onLine, () => true)

  // Refetch whatever arrived while the browser was offline.
  useEffect(() => {
    const refetch = () => invalidateLiveData(queryClient)
    window.addEventListener('online', refetch)
    return () => window.removeEventListener('online', refetch)
  }, [queryClient])

  if (online) return null
  return (
    <div role="alert" className="bg-ink px-4 py-2 text-sm text-white">
      <strong className="font-semibold">Sem conexão com a internet.</strong> O que você digitou fica guardado; o painel
      atualiza quando a conexão voltar.
    </div>
  )
}
