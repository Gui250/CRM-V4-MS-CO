import { DomainError } from '../../lib/errors.js'
import { MAX_SOURCE_ROWS } from '../../models/bi/limits.js'

/** Every connector stops the capture once a source passes the row cap (FR-025). */
export function countRow(count: number, source = 'A planilha'): number {
  if (count >= MAX_SOURCE_ROWS) throw new DomainError('TOO_MANY_ROWS', `${source} passa de 500.000 linhas.`, 422)
  return count + 1
}

/** Empty header → `Coluna N`; repeated header → `Nome (2)`, `Nome (3)`… so keys stay unique. */
export function uniqueHeaders(raw: unknown[]): string[] {
  const seen = new Map<string, number>()
  return raw.map((value, index) => {
    const name = String(value ?? '').trim() || `Coluna ${index + 1}`
    const times = (seen.get(name) ?? 0) + 1
    seen.set(name, times)
    return times === 1 ? name : `${name} (${times})`
  })
}

const isBlank = (value: unknown) => value === null || value === undefined || value === ''

export interface SheetRecord<T> {
  /** 1-based row number in the sheet. */
  number: number
  values: T[]
}

/**
 * Spreadsheet rows → objects. Rows above `headerRow` are skipped (titles, notes), the header row
 * names the keys, fully blank rows are dropped and the rest are capped at MAX_SOURCE_ROWS.
 */
export async function* recordsToRows<T>(
  records: AsyncIterable<SheetRecord<T>>,
  headerRow: number,
  empty: T,
): AsyncGenerator<Record<string, T>> {
  let headers: string[] | null = null
  let count = 0
  for await (const record of records) {
    if (record.number < headerRow) continue
    if (!headers) {
      headers = uniqueHeaders(record.values)
      continue
    }
    if (record.values.every(isBlank)) continue
    count = countRow(count)
    yield Object.fromEntries(headers.map((key, i) => [key, record.values[i] ?? empty]))
  }
}
