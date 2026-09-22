'use client'

import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
// Flow editor canvas styles (feature 003); loaded once for the whole panel.
import '@xyflow/react/dist/style.css'
import { BrandLogo } from '@/components/brand-logo'
import { DisconnectedBanner } from '@/components/connection/disconnected-banner'
import { OfflineBanner } from '@/components/connection/offline-banner'
import { PanelNav } from '@/components/panel-nav'
import { apiFetch } from '@/lib/api'
import { reportError } from '@/lib/logger'
import { useConnection } from '@/lib/use-connection'
import { useEvents } from '@/lib/use-events'
import { useMe } from '@/lib/use-me'
import type { User } from '@/lib/types'

export default function PanelLayout({ children }: { children: React.ReactNode }) {
  const { data: me, isError } = useMe()
  return me ? <Panel me={me}>{children}</Panel> : <Loading redirect={isError} />
}

function Loading({ redirect }: { redirect: boolean }) {
  const router = useRouter()
  useEffect(() => {
    if (redirect) router.replace('/login')
  }, [redirect, router])
  return (
    <div className="grid min-h-dvh place-items-center" aria-busy="true">
      <span className="size-3 animate-pulse bg-brand" aria-label="Carregando" />
    </div>
  )
}

/** Mounted only with a session, so the event stream and connection query never run logged out. */
function Panel({ me, children }: { me: User; children: React.ReactNode }) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { data: connection } = useConnection()
  useEvents()

  async function logout() {
    await apiFetch('/api/auth/logout', { method: 'POST' }).catch((error: unknown) => reportError(error, 'logout'))
    queryClient.clear()
    router.replace('/login')
  }

  return (
    <div className="flex h-dvh flex-col md:flex-row">
      <aside className="flex shrink-0 items-center justify-between gap-4 bg-ink px-4 py-3 md:w-56 md:flex-col md:items-stretch md:justify-start md:gap-10 md:px-3 md:py-6">
        <div className="shrink-0 md:px-1">
          <div className="md:hidden">
            <BrandLogo tone="dark" compact />
          </div>
          <div className="hidden md:block">
            <BrandLogo tone="dark" />
          </div>
        </div>
        <PanelNav role={me.role} />
        <div className="hidden flex-1 md:block" />
        <div className="flex shrink-0 items-center gap-3 md:flex-col md:items-stretch md:border-t md:border-white/10 md:pt-4">
          <div className="hidden min-w-0 md:block md:px-1">
            <p className="truncate text-sm font-semibold text-white">{me.name}</p>
            <p className="font-mono text-[11px] tracking-wide text-white/60 uppercase">
              {me.role === 'admin' ? 'Administrador' : 'Atendente'}
            </p>
          </div>
          <button onClick={logout} className="px-3 py-2 text-left text-sm font-semibold text-white/75 hover:bg-white/10 hover:text-white md:px-1">
            Sair
          </button>
        </div>
      </aside>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <OfflineBanner />
        <DisconnectedBanner connection={connection} />
        <main className="min-h-0 flex-1">{children}</main>
      </div>
    </div>
  )
}
