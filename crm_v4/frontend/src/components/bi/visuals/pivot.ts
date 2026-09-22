import { compareCells } from './cell-format'

export const MAX_PIVOT_COLUMNS = 50

export type PivotRow = { keys: unknown[]; cells: (number | null)[]; total: number }
export type PivotTable = { columns: unknown[]; rows: PivotRow[]; columnTotals: number[]; grandTotal: number; truncated: boolean }

const toNumber = (value: unknown) => (value === null || value === undefined || value === '' ? null : Number(value))

/** Rows `[rowDim..., columnDim, value]` → matrix with row/column totals; totals cover the shown columns only. */
export function pivot(rows: unknown[][], rowDimensions: number, maxColumns = MAX_PIVOT_COLUMNS): PivotTable {
  const allColumns = [...new Set(rows.map((r) => r[rowDimensions]))].sort(compareCells)
  const columns = allColumns.slice(0, maxColumns)
  const position = new Map(columns.map((c, i) => [c, i]))
  const byKey = new Map<string, PivotRow>()
  for (const row of rows) {
    const column = position.get(row[rowDimensions])
    const value = toNumber(row[rowDimensions + 1])
    if (column === undefined || value === null || Number.isNaN(value)) continue
    const keys = row.slice(0, rowDimensions)
    const id = JSON.stringify(keys)
    const entry = byKey.get(id) ?? { keys, cells: columns.map(() => null), total: 0 }
    entry.cells[column] = (entry.cells[column] ?? 0) + value
    entry.total += value
    byKey.set(id, entry)
  }
  const pivotRows = [...byKey.values()]
  const columnTotals = columns.map((_, i) => pivotRows.reduce((sum, r) => sum + (r.cells[i] ?? 0), 0))
  return {
    columns,
    rows: pivotRows,
    columnTotals,
    grandTotal: columnTotals.reduce((a, b) => a + b, 0),
    truncated: allColumns.length > maxColumns,
  }
}
