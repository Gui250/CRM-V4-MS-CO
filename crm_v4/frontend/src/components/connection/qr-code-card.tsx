'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { ApiError, apiFetch } from '@/lib/api'
import { formatDate, formatPhone, formatTime } from '@/lib/format'
import { connectionQueryKey } from '@/lib/use-connection'
import type { Connection } from '@/lib/types'

const STATUS_LABEL: Record<Connection['status'], string> = {
  disconnected: 'Desconectado',
  awaiting_qr: 'Aguardando leitura do QR Code',
  connected: 'Conectado',
}

export function QrCodeCard({ connection, isAdmin }: { connection: Connection; isAdmin: boolean }) {
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const action = useMutation({
    mutationFn: (path: 'connect' | 'logout') => apiFetch<Connection>(`/api/connection/${path}`, { method: 'POST' }),
    onMutate: () => setError(null),
    onSuccess: (data) => queryClient.setQueryData(connectionQueryKey, data),
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Não foi possível concluir. Tente novamente.'),
  })

  return (
    <section className="border border-line bg-paper">
      <header className="flex items-center justify-between gap-4 border-b border-line px-5 py-4">
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className={`size-2.5 ${connection.status === 'connected' ? 'bg-emerald-600' : connection.status === 'awaiting_qr' ? 'animate-pulse bg-amber-500' : 'bg-brand'}`}
          />
          <p className="font-semibold" role="status">
            {STATUS_LABEL[connection.status]}
          </p>
        </div>
        <span className="font-mono text-xs tracking-wide text-muted uppercase">WhatsApp</span>
      </header>

      <div className="px-5 py-6">
        {connection.status === 'connected' && (
          <div className="flex flex-col gap-1">
            <p className="font-mono text-2xl font-semibold">{connection.phoneNumber ? formatPhone(connection.phoneNumber) : 'Número conectado'}</p>
            {connection.lastConnectedAt && (
              <p className="text-sm text-muted">
                Conectado em {formatDate(new Date(connection.lastConnectedAt))} às {formatTime(connection.lastConnectedAt)}
              </p>
            )}
          </div>
        )}

        {connection.status === 'awaiting_qr' && connection.qrCode && (
          <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center">
            {/* eslint-disable-next-line @next/next/no-img-element -- data URL from Evolution, next/image adds nothing */}
            <img src={connection.qrCode} alt="QR Code para conectar o WhatsApp" className="size-56 border border-line p-2" />
            <ol className="list-inside list-decimal space-y-1.5 text-sm">
              <li>Abra o WhatsApp no celular da empresa.</li>
              <li>Toque em Mais opções ou Configurações.</li>
              <li>Entre em Aparelhos conectados e toque em Conectar um aparelho.</li>
              <li>Aponte a câmera para este código. Ele se renova sozinho.</li>
            </ol>
          </div>
        )}

        {connection.status === 'disconnected' && (
          <p className="text-sm text-muted">
            {isAdmin
              ? 'Conecte o número da empresa para receber e responder as conversas por aqui.'
              : 'O WhatsApp está desconectado. Peça a um administrador para conectar o número.'}
          </p>
        )}

        {error && (
          <p role="alert" className="mt-4 border-l-4 border-brand bg-brand/5 px-3 py-2 text-sm">
            {error}
          </p>
        )}
      </div>

      {isAdmin && (
        <footer className="flex justify-end border-t border-line px-5 py-4">
          {connection.status === 'connected' ? (
            <Button variant="danger" disabled={action.isPending} onClick={() => action.mutate('logout')}>
              Desconectar
            </Button>
          ) : (
            <Button disabled={action.isPending} onClick={() => action.mutate('connect')}>
              {connection.status === 'awaiting_qr' ? 'Gerar novo QR Code' : 'Conectar'}
            </Button>
          )}
        </footer>
      )}
    </section>
  )
}
