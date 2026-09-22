'use client'

import Link from 'next/link'
import type { Connection } from '@/lib/types'

export function DisconnectedBanner({ connection }: { connection: Connection | undefined }) {
  if (!connection || connection.status === 'connected') return null
  return (
    <div role="alert" className="flex items-center justify-between gap-4 bg-brand px-4 py-2 text-sm text-white">
      <p>
        <strong className="font-semibold">WhatsApp desconectado.</strong> Novas mensagens não chegam até o número ser
        conectado.
      </p>
      <Link href="/conexao" className="shrink-0 font-semibold underline underline-offset-4">
        Ver conexão
      </Link>
    </div>
  )
}
