'use client'

import { useMe } from '@/lib/use-me'

/** Page shell for the admin-only "Fontes de dados" screens. */
export function AdminOnly({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  const { data: me } = useMe()
  if (!me) return null
  if (me.role !== 'admin') return <p className="p-8 text-sm text-muted">Apenas administradores gerenciam fontes de dados.</p>
  return (
    <div className="h-full overflow-y-auto bg-mist">
      <div className="mx-auto flex max-w-5xl flex-col gap-8 px-4 py-6 md:px-8 md:py-10">
        <header>
          <h1 className="font-display text-2xl font-extrabold uppercase [font-stretch:115%]">{title}</h1>
          {description && <p className="mt-1 text-sm text-muted">{description}</p>}
        </header>
        {children}
      </div>
    </div>
  )
}
