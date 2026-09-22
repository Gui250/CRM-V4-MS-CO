'use client'

import { formatNumber } from '@/lib/bi/format'
import type { QueryRequest, QueryResult, Visual } from '@/lib/bi/types'
import { useVisualQuery } from '@/lib/bi/use-bi'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}/

/** Same query with its date `between` filter shifted back by the period's own length; null without one. */
export function previousPeriodRequest(request: QueryRequest | null): QueryRequest | null {
  if (!request) return null
  const index = request.filters.findIndex((f) => f.op === 'between' && f.values.length === 2 && f.values.every((v) => typeof v === 'string' && ISO_DATE.test(v)))
  const filter = request.filters[index]
  if (!filter) return null
  const [start, end] = filter.values.map((v) => Date.parse(String(v))) as [number, number]
  const length = end - start + 1 // `between` is inclusive, the end is the last millisecond
  const filters = [...request.filters]
  filters[index] = { ...filter, values: [new Date(start - length).toISOString(), new Date(end - length).toISOString()] }
  return { ...request, filters }
}

const lastNumber = (result: QueryResult | undefined) => {
  const value = result?.rows[0]?.at(-1)
  return value === null || value === undefined ? null : Number(value)
}

export function KpiVisual({ visual, result, request, title }: { visual: Visual; result: QueryResult; request: QueryRequest | null; title: string }) {
  const previous = useVisualQuery(visual.options.compareWithPreviousPeriod ? previousPeriodRequest(request) : null)
  const value = lastNumber(result)
  const before = lastNumber(previous.data)
  const format = visual.options.numberFormat ?? (result.columns.at(-1)?.type === 'currency' ? 'currency' : undefined)
  const change = value !== null && before ? (value - before) / Math.abs(before) : null

  return (
    <div className="flex h-full flex-col justify-center gap-1">
      <p aria-label={`${title}: ${formatNumber(value, format)}`} className="font-display text-4xl leading-none font-extrabold tabular-nums [font-stretch:110%]">
        {formatNumber(value, format)}
      </p>
      {change !== null && (
        <p className={`font-mono text-xs font-bold ${change >= 0 ? 'text-stage-green' : 'text-brand'}`}>
          {change >= 0 ? '▲' : '▼'} {formatNumber(Math.abs(change), 'percent')} vs. período anterior
        </p>
      )}
    </div>
  )
}
