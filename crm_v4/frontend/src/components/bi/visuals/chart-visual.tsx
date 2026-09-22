'use client'

import { useMemo, useState } from 'react'
import type { ECElementEvent } from 'echarts/core'
import { categoryValues, seriesPointToValue, toChartOption } from '@/lib/bi/echarts-options'
import { formatBucket, nextGrain } from '@/lib/bi/format'
import { OTHERS_LABEL, VISUAL_TYPE_LABELS, type QueryResult, type Scalar, type Visual } from '@/lib/bi/types'
import { crossFilterFor, drillField, effectiveGrain, type CrossFilter } from '@/lib/bi/view-state'
import { useReportScope } from '../report-scope'
import { EChart } from './echart'

const SMALL_BUTTON = 'h-7 border border-ink/80 px-2 text-xs font-semibold hover:bg-mist aria-pressed:bg-ink aria-pressed:text-white'

/** Raw category that stays solid while this visual's cross-filter is active. */
function highlightFor(crossFilter: CrossFilter | undefined, visual: Visual, categories: unknown[]) {
  if (!crossFilter || crossFilter.visualId !== visual.id) return undefined
  const first = crossFilter.values[0]
  if (crossFilter.op === 'in') return first
  // Date buckets: the backend's ISO and ours may be written differently for the same instant.
  const start = Date.parse(String(first))
  return categories.find((c) => typeof c === 'string' && Date.parse(c) === start)
}

export function ChartVisual({ visual, result, title }: { visual: Visual; result: QueryResult; title: string }) {
  const { view, dispatchView } = useReportScope()
  const [drilling, setDrilling] = useState(false)
  const grain = effectiveGrain(visual, view)
  const categories = useMemo(() => categoryValues(visual, result), [visual, result])
  const highlightValue = highlightFor(view.crossFilter, visual, categories)
  const option = useMemo(
    () => toChartOption(visual, result, {}, { highlightValue, dateGrain: grain }),
    [visual, result, highlightValue, grain],
  )
  const levels = view.drill[visual.id] ?? []
  const canDrill = drillField(visual) !== undefined && grain !== undefined && nextGrain(grain) !== null
  const drillMode = drilling && canDrill

  const drillInto = (bucket: string) => grain && dispatchView({ type: 'drillDown', visualId: visual.id, fromGrain: grain, bucket })

  function onItemClick(params: ECElementEvent) {
    const value = seriesPointToValue(visual, result, params)
    if (value === undefined || value === null || value === OTHERS_LABEL) return
    if (drillMode) return drillInto(String(value))
    if (!visual.options.crossFilter) return
    const crossFilter = crossFilterFor(visual, value as Scalar, view)
    if (crossFilter) dispatchView({ type: 'toggleCrossFilter', crossFilter })
  }

  return (
    <div className="flex h-full flex-col gap-1">
      {(canDrill || levels.length > 0) && (
        <div className="flex flex-wrap items-center gap-1">
          {canDrill && (
            <button type="button" aria-pressed={drillMode} onClick={() => setDrilling(!drilling)} className={SMALL_BUTTON}>
              Detalhar
            </button>
          )}
          {drillMode && (
            <select aria-label="Período para detalhar" value="" onChange={(e) => drillInto(e.target.value)} className="h-7 border border-ink/80 bg-paper px-1 text-xs">
              <option value="">Escolha ou clique no gráfico…</option>
              {categories
                .filter((c): c is string => typeof c === 'string' && c !== OTHERS_LABEL)
                .map((c) => (
                  <option key={c} value={c}>
                    {formatBucket(c, grain!)}
                  </option>
                ))}
            </select>
          )}
          {levels.length > 0 && (
            <button type="button" onClick={() => dispatchView({ type: 'drillUp', visualId: visual.id })} className={SMALL_BUTTON}>
              Voltar nível
            </button>
          )}
        </div>
      )}
      <EChart option={option} ariaLabel={`${VISUAL_TYPE_LABELS[visual.type]}: ${title}`} className="min-h-0 flex-1" onItemClick={onItemClick} />
    </div>
  )
}
