'use client'

import { useState } from 'react'
import type { Filter, Visual } from '@/lib/bi/types'
import { filterIndexFor } from '../page-filters'
import { useReportScope } from '../report-scope'
import { DATE_PRESETS, dayRange, presetRange, toDayInput, type PresetId } from './date-presets'

type Mode = PresetId | 'all' | 'custom'

function modeOf(filter: Filter | undefined): Mode {
  if (!filter || filter.values.length !== 2) return 'all'
  const match = DATE_PRESETS.find((p) => JSON.stringify(presetRange(p.id)) === JSON.stringify(filter.values))
  return match?.id ?? 'custom'
}

const INPUT = 'h-8 border-b-2 border-ink/20 bg-mist px-2 text-sm outline-none focus:border-brand'

export function FilterDateVisual({ visual }: { visual: Visual }) {
  const { page, view, setFilter } = useReportScope()
  const index = filterIndexFor(page, visual)
  const filter = view.overrides[index] ?? page.filters[index]
  // Derived from the filter so clearing it elsewhere (trail) resets the select; `custom` also while dates are being typed.
  const [editingCustom, setEditingCustom] = useState(false)
  const mode: Mode = editingCustom ? 'custom' : modeOf(filter)
  const [from, setFrom] = useState(() => toDayInput(String(filter?.values[0] ?? '')))
  const [to, setTo] = useState(() => toDayInput(String(filter?.values[1] ?? '')))
  if (index < 0 || !filter) return null

  const apply = (values: string[]) => setFilter(index, { ...filter, op: 'between', values })

  function choose(next: Mode) {
    setEditingCustom(next === 'custom')
    if (next === 'all') apply([])
    else if (next !== 'custom') apply(presetRange(next))
  }

  function applyCustom(nextFrom: string, nextTo: string) {
    setFrom(nextFrom)
    setTo(nextTo)
    if (nextFrom && nextTo && nextFrom <= nextTo) apply(dayRange(nextFrom, nextTo))
  }

  return (
    <div className="flex flex-col gap-2">
      <select aria-label="Período" value={mode} onChange={(e) => choose(e.target.value as Mode)} className={INPUT}>
        <option value="all">Todo o período</option>
        {DATE_PRESETS.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
          </option>
        ))}
        <option value="custom">Personalizado</option>
      </select>
      {mode === 'custom' && (
        <div className="flex flex-wrap gap-2 text-xs font-semibold">
          <label className="flex flex-col gap-0.5">
            De
            <input type="date" value={from} max={to || undefined} onChange={(e) => applyCustom(e.target.value, to)} className={INPUT} />
          </label>
          <label className="flex flex-col gap-0.5">
            Até
            <input type="date" value={to} min={from || undefined} onChange={(e) => applyCustom(from, e.target.value)} className={INPUT} />
          </label>
        </div>
      )}
    </div>
  )
}
