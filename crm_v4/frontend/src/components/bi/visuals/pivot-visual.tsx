'use client'

import type { QueryResult, Visual } from '@/lib/bi/types'
import { cellFormatter } from './cell-format'
import { MAX_PIVOT_COLUMNS, pivot } from './pivot'

const TH = 'border-b border-line bg-mist px-2 py-1.5 text-left font-mono text-[11px] font-bold uppercase tracking-wide whitespace-nowrap'
const TD = 'border-b border-line px-2 py-1.5 whitespace-nowrap'

export function PivotVisual({ visual, result, title }: { visual: Visual; result: QueryResult; title: string }) {
  const rowDims = visual.slots.category?.length ?? 1
  const table = pivot(result.rows, rowDims)
  const format = cellFormatter(visual, result)
  const value = (n: number | null) => (n === null ? '' : format(rowDims + 1, n))

  return (
    <div className="flex h-full flex-col gap-1">
      {table.truncated && (
        <p className="text-xs text-muted">Mostrando as primeiras {MAX_PIVOT_COLUMNS} colunas.</p>
      )}
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full border-collapse text-sm tabular-nums">
          <caption className="sr-only">{title}</caption>
          <thead>
            <tr>
              {result.columns.slice(0, rowDims).map((c) => (
                <th key={c.key} scope="col" className={TH}>
                  {c.label}
                </th>
              ))}
              {table.columns.map((c, i) => (
                <th key={i} scope="col" className={`${TH} text-right`}>
                  {format(rowDims, c)}
                </th>
              ))}
              <th scope="col" className={`${TH} text-right`}>
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row) => (
              <tr key={JSON.stringify(row.keys)}>
                {row.keys.map((k, i) => (
                  <th key={i} scope="row" className={`${TD} text-left font-semibold`}>
                    {format(i, k)}
                  </th>
                ))}
                {row.cells.map((cell, i) => (
                  <td key={i} className={`${TD} text-right`}>
                    {value(cell)}
                  </td>
                ))}
                <td className={`${TD} text-right font-bold`}>{value(row.total)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" colSpan={rowDims} className={`${TD} text-left font-bold`}>
                Total
              </th>
              {table.columnTotals.map((total, i) => (
                <td key={i} className={`${TD} text-right font-bold`}>
                  {value(total)}
                </td>
              ))}
              <td className={`${TD} text-right font-bold text-brand`}>{value(table.grandTotal)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
