'use client'

import { QrCodeCard } from '@/components/connection/qr-code-card'
import { useConnection } from '@/lib/use-connection'
import { useMe } from '@/lib/use-me'

export default function ConnectionPage() {
  const { data: me } = useMe()
  const { data: connection, isError } = useConnection()

  return (
    <div className="mx-auto max-w-3xl px-5 py-8 md:px-10 md:py-12">
      <h1 className="font-display text-3xl font-extrabold uppercase [font-stretch:115%]">Conexão</h1>
      <p className="mt-2 mb-8 text-sm text-muted">O número de WhatsApp que recebe e envia as conversas do painel.</p>
      {isError && <p className="text-sm text-brand">Não foi possível carregar o status da conexão.</p>}
      {connection && me && <QrCodeCard connection={connection} isAdmin={me.role === 'admin'} />}
    </div>
  )
}
