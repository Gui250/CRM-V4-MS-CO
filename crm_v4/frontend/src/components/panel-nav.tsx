'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { UserRole } from '@/lib/types'

const LINKS: { href: string; label: string; adminOnly?: boolean }[] = [
  { href: '/chat', label: 'Chat' },
  { href: '/funis', label: 'Funis' },
  { href: '/automacoes', label: 'Automações', adminOnly: true },
  { href: '/relatorios', label: 'Relatórios' },
  { href: '/fontes', label: 'Fontes de dados', adminOnly: true },
  { href: '/conexao', label: 'Conexão' },
  { href: '/usuarios', label: 'Usuários', adminOnly: true },
]

export function PanelNav({ role }: { role: UserRole }) {
  const pathname = usePathname()
  return (
    <nav aria-label="Principal" className="flex min-w-0 gap-1 overflow-x-auto md:flex-col md:overflow-visible">
      {LINKS.filter((link) => !link.adminOnly || role === 'admin').map((link) => {
        const active = pathname.startsWith(link.href)
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? 'page' : undefined}
            className={`relative shrink-0 px-3 py-2 text-sm whitespace-nowrap font-semibold tracking-wide transition-colors md:px-4 md:py-2.5 ${
              active ? 'bg-brand text-white cut-corner [--cut:8px]' : 'text-white/75 hover:bg-white/10 hover:text-white'
            }`}
          >
            {link.label}
          </Link>
        )
      })}
    </nav>
  )
}
