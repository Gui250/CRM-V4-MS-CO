import { formatBucket, formatCell } from '@/lib/bi/format'
import { OTHERS_LABEL, type FieldRef, type QueryResult, type Visual } from '@/lib/bi/types'

/** Dimensions in query order: categories, then legend/columns (matches build-query). */
export const visualDimensions = (visual: Visual): FieldRef[] => {
  const split = visual.slots.legend ?? visual.slots.columns
  return [...(visual.slots.category ?? []), ...(split ? [split] : [])]
}

/** Formats cell `value` of column `index`: date buckets by grain, measures with the visual's number format. */
export function cellFormatter(visual: Visual, result: QueryResult) {
  const dims = visualDimensions(visual)
  return (index: number, value: unknown) => {
    const column = result.columns[index]
    const type = column?.type ?? 'text'
    const dim = dims[index]
    if (dim) {
      return dim.dateGrain && typeof value === 'string' && value !== OTHERS_LABEL ? formatBucket(value, dim.dateGrain) : formatCell(value, type)
    }
    return formatCell(value, type === 'currency' ? 'currency' : 'number', visual.options.numberFormat)
  }
}

/** Sorts numbers numerically and everything else as pt-BR text; empty values always last. */
export function compareCells(a: unknown, b: unknown) {
  if (a === null || a === undefined) return b === null || b === undefined ? 0 : 1
  if (b === null || b === undefined) return -1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a).localeCompare(String(b), 'pt-BR', { numeric: true })
}
