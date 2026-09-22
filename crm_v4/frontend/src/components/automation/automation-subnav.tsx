'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const TABS = [
  { href: '/automacoes', label: 'Fluxos' },
  { href: '/automacoes/agentes', label: 'Agentes' },
  { href: '/automacoes/provedores', label: 'Provedores de IA' },
]

export function AutomationSubnav() {
  const pathname = usePathname()
  return (
    <nav aria-label="Automações" className="mb-8 flex flex-wrap gap-1 border-b border-line">
      {TABS.map((tab) => {
        const isCurrent = pathname === tab.href
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={isCurrent ? 'page' : undefined}
            className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-semibold ${isCurrent ? 'border-brand text-ink' : 'border-transparent text-muted hover:text-ink'}`}
          >
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
