import { VISUAL_TYPES, VISUAL_TYPE_LABELS, type VisualType } from '@/lib/bi/types'
import { VISUAL_MIME } from './field-meta'

const GLYPHS: Record<VisualType, string> = {
  kpi: '123',
  bar: '☰',
  column: '▥',
  line: '⟋',
  area: '◢',
  pie: '◔',
  donut: '◎',
  funnel: '⏷',
  table: '▦',
  pivot: '⊞',
  filter_list: '☑',
  filter_date: '▭',
  text: 'T',
}

/** Visual types to drag onto the canvas; click or Enter adds at the first free spot (FR-008). */
export function VisualPalette({ onAdd, disabled = false }: { onAdd: (type: VisualType) => void; disabled?: boolean }) {
  return (
    <section aria-labelledby="bi-palette-title" className="flex flex-col gap-2">
      <h2 id="bi-palette-title" className="font-mono text-[11px] font-bold tracking-widest text-muted uppercase">
        Componentes
      </h2>
      <ul className="grid grid-cols-2 gap-1">
        {VISUAL_TYPES.map((type) => (
          <li key={type}>
            <button
              type="button"
              draggable={!disabled}
              disabled={disabled}
              onDragStart={(e) => {
                e.dataTransfer.setData(VISUAL_MIME, type)
                e.dataTransfer.effectAllowed = 'copy'
              }}
              onClick={() => onAdd(type)}
              aria-label={`Adicionar ${VISUAL_TYPE_LABELS[type]}`}
              className="group flex h-16 w-full cursor-grab flex-col items-center justify-center gap-1 border border-line bg-paper px-1 text-center hover:border-brand active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span aria-hidden className="font-mono text-base leading-none text-ink group-hover:text-brand">
                {GLYPHS[type]}
              </span>
              <span className="text-[11px] leading-tight font-semibold">{VISUAL_TYPE_LABELS[type]}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
