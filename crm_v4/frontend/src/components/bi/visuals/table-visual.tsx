'use client'

import { useState } from 'react'
import type { QueryResult, Visual } from '@/lib/bi/types'
import { cellFormatter, compareCells } from './cell-format'

type Sort = { index: number; dir: 'asc' | 'desc' }

export function TableVisual({ visual, result, title }: { visual: Visual; result: QueryResult; title: string }) {
  const [sort, setSort] = useState<Sort | null>(null)
  const format = cellFormatter(visual, result)
  const rows = sort
    ? [...result.rows].sort((a, b) => compareCells(a[sort.index], b[sort.index]) * (sort.dir === 'asc' ? 1 : -1))
    : result.rows
  const toggle = (index: number) =>
    setSort((current) => ({ index, dir: current?.index === index && current.dir === 'asc' ? 'desc' : 'asc' }))

  return (
    <div className="h-full overflow-auto">
      <table className="w-full border-collapse text-sm tabular-nums">
        <caption className="sr-only">{title}</caption>
        <thead className="sticky top-0">
          <tr>
            {result.columns.map((column, index) => {
              const direction = sort?.index === index ? sort.dir : null
              return (
                <th
                  key={column.key}
                  scope="col"
                  aria-sort={direction === 'asc' ? 'ascending' : direction === 'desc' ? 'descending' : 'none'}
                  className="border-b border-ink/80 bg-paper px-2 py-1.5 text-left"
                >
                  <button
                    type="button"
                    onClick={() => toggle(index)}
                    className="flex items-center gap-1 font-mono text-[11px] font-bold tracking-wide uppercase hover:text-brand"
                  >
                    {column.label}
                    <span aria-hidden className="text-brand">
                      {direction === 'asc' ? '▲' : direction === 'desc' ? '▼' : ''}
                    </span>
                  </button>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            <tr key={r} className="odd:bg-mist/60">
              {row.map((cell, index) => (
                <td key={index} className="border-b border-line px-2 py-1.5 whitespace-nowrap">
                  {format(index, cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
