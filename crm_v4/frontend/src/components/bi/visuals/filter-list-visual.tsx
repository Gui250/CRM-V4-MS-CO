'use client'

import { formatBucket, formatCell } from '@/lib/bi/format'
import type { QueryResult, Scalar, Visual } from '@/lib/bi/types'
import { filterIndexFor } from '../page-filters'
import { useReportScope } from '../report-scope'

const isScalar = (v: unknown): v is Scalar => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'

export function FilterListVisual({ visual, result, title }: { visual: Visual; result: QueryResult; title: string }) {
  const { page, view, setFilter } = useReportScope()
  const index = filterIndexFor(page, visual)
  const filter = view.overrides[index] ?? page.filters[index]
  if (index < 0 || !filter) return null

  const grain = visual.slots.category?.[0]?.dateGrain
  const type = result.columns[0]?.type ?? 'text'
  const label = (v: Scalar) => (grain && typeof v === 'string' ? formatBucket(v, grain) : formatCell(v, type))
  const selected = new Set(filter.values.map(String))
  const options = result.rows.flatMap((row) => (isScalar(row[0]) ? [{ value: row[0], count: Number(row[1] ?? 0) }] : []))

  const toggle = (value: Scalar, checked: boolean) => {
    const values = checked ? [...filter.values, value] : filter.values.filter((v) => String(v) !== String(value))
    setFilter(index, { ...filter, op: 'in', values })
  }

  return (
    <fieldset className="flex h-full min-h-0 flex-col gap-1">
      <legend className="sr-only">{title}</legend>
      <div className="min-h-0 flex-1 overflow-auto">
        {options.map((option) => (
          <label key={String(option.value)} className="flex items-center gap-2 px-1 py-0.5 text-sm hover:bg-mist">
            <input
              type="checkbox"
              checked={selected.has(String(option.value))}
              onChange={(e) => toggle(option.value, e.target.checked)}
              className="accent-brand"
            />
            <span className="min-w-0 flex-1 truncate">{label(option.value)}</span>
            <span className="font-mono text-[11px] text-muted">{option.count}</span>
          </label>
        ))}
      </div>
      {selected.size > 0 && (
        <button type="button" onClick={() => setFilter(index, { ...filter, values: [] })} className="self-start text-xs font-semibold text-brand hover:underline">
          Limpar seleção
        </button>
      )}
    </fieldset>
  )
}
