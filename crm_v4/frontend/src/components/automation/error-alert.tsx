import { ApiError } from '@/lib/api'
import { formatDate, formatTime } from '@/lib/format'

export const errorMessage = (error: unknown, fallback = 'Não foi possível concluir a ação.') =>
  error instanceof ApiError ? error.message : fallback

export const formatDateTime = (iso: string) => `${formatDate(new Date(iso))} ${formatTime(iso)}`

export function ErrorAlert({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <p role="alert" className="border-l-4 border-brand bg-brand/5 px-3 py-2 text-sm">
      {message}
    </p>
  )
}

export function AdminOnly({ children }: { children: React.ReactNode }) {
  return <p className="p-8 text-sm text-muted">{children}</p>
}

export function PageTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <>
      <h1 className="font-display text-3xl font-extrabold uppercase [font-stretch:115%]">{title}</h1>
      <p className="mt-2 mb-8 text-sm text-muted">{subtitle}</p>
    </>
  )
}
