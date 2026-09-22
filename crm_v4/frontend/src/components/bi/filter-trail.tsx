import type { TrailItem } from '@/lib/bi/view-state'

/** Breadcrumb of the viewer's active interactions (FR-018), each removable. */
export function FilterTrail({ items, onRemove, onClear }: { items: TrailItem[]; onRemove: (id: string) => void; onClear: () => void }) {
  if (items.length === 0) return null
  return (
    <div role="region" aria-label="Filtros ativos" className="bi-no-print flex flex-wrap items-center gap-2 border-b border-line bg-paper px-4 py-2">
      <span className="font-mono text-[11px] font-bold tracking-wider text-muted uppercase">Filtros</span>
      <ul className="flex flex-wrap gap-1.5">
        {items.map((item) => (
          <li key={item.id} className="flex items-center bg-ink text-xs font-semibold text-white">
            <span className="py-1 pl-2">{item.label}</span>
            <button type="button" aria-label={`Remover filtro ${item.label}`} onClick={() => onRemove(item.id)} className="px-2 py-1 hover:bg-brand">
              ×
            </button>
          </li>
        ))}
      </ul>
      <button type="button" onClick={onClear} className="text-xs font-semibold text-brand hover:underline">
        Limpar tudo
      </button>
    </div>
  )
}
