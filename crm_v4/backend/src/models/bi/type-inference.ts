// Field type recognition and value normalization for external sources (FR-010, research §9).
// Values are stored normalized so report queries can cast without failing: numbers as JSON
// numbers, dates as ISO-8601 UTC, booleans as booleans, anything unparseable as null.
import type { FieldType, SourceField } from './definition.js'

const MATCH_RATIO = 0.95
const CURRENCY_RATIO = 0.8
// Brazil has had no daylight saving time since 2019, so São Paulo is a fixed UTC-3.
const SAO_PAULO_OFFSET_HOURS = 3

const TRUE_WORDS = new Set(['sim', 's', 'true', 'verdadeiro', 'yes', 'y'])
const FALSE_WORDS = new Set(['não', 'nao', 'n', 'false', 'falso', 'no'])

const isEmpty = (value: unknown) => value === null || value === undefined || (typeof value === 'string' && value.trim() === '')

export function parseBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value
  if (typeof value !== 'string') return null
  const word = value.trim().toLowerCase()
  if (TRUE_WORDS.has(word)) return true
  if (FALSE_WORDS.has(word)) return false
  return null
}

const PT_THOUSANDS = /^\d{1,3}(\.\d{3})+$/
const PLAIN_NUMBER = /^\d+(\.\d+)?$/

/** Accepts `1.234,56`, `1,234.56`, `1234,5`, `R$ 10`, `-3,5`, `12%` (→ 0.12). */
export function parseNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'bigint') return Number(value)
  if (typeof value !== 'string') return null
  let text = value.trim().replace(/^R\$\s*/i, '').replace(/\s/g, '')
  const isPercent = text.endsWith('%')
  if (isPercent) text = text.slice(0, -1)
  const negative = text.startsWith('-')
  if (negative) text = text.slice(1)
  const lastComma = text.lastIndexOf(',')
  const lastDot = text.lastIndexOf('.')
  if (lastComma >= 0 && lastDot >= 0) {
    const decimal = lastComma > lastDot ? ',' : '.'
    text = text.replaceAll(decimal === ',' ? '.' : ',', '').replace(decimal, '.')
  } else if (lastComma >= 0) {
    text = text.replace(',', '.')
  } else if (PT_THOUSANDS.test(text)) {
    text = text.replaceAll('.', '')
  }
  if (!PLAIN_NUMBER.test(text)) return null
  const number = Number(text) * (negative ? -1 : 1)
  return isPercent ? number / 100 : number
}

type ParsedDate = { date: Date; hasTime: boolean }

const BR_DATE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/

function saoPauloDate(year: number, month: number, day: number, hour = 0, minute = 0, second = 0): Date | null {
  const date = new Date(Date.UTC(year, month - 1, day, hour + SAO_PAULO_OFFSET_HOURS, minute, second))
  const local = new Date(date.getTime() - SAO_PAULO_OFFSET_HOURS * 3_600_000)
  const valid = local.getUTCFullYear() === year && local.getUTCMonth() === month - 1 && local.getUTCDate() === day
  return valid && hour < 24 && minute < 60 && second < 60 ? date : null
}

export function parseDate(value: unknown): ParsedDate | null {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null
    // Spreadsheet dates arrive as UTC midnight of the calendar day; keep that day in São Paulo.
    const isCalendarDay = value.getUTCHours() === 0 && value.getUTCMinutes() === 0 && value.getUTCSeconds() === 0
    if (isCalendarDay) return { date: saoPauloDate(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate())!, hasTime: false }
    return { date: value, hasTime: true }
  }
  if (typeof value !== 'string') return null
  const text = value.trim()
  const br = BR_DATE.exec(text)
  if (br) {
    const [, d, m, y, h, min, s] = br.map((part) => (part === undefined ? undefined : Number(part)))
    const date = saoPauloDate(y!, m!, d!, h ?? 0, min ?? 0, s ?? 0)
    return date ? { date, hasTime: h !== undefined } : null
  }
  const iso = ISO_DATE.exec(text)
  if (!iso) return null
  const hasTime = iso[4] !== undefined
  if (iso[7]) {
    const date = new Date(text.replace(' ', 'T'))
    return Number.isNaN(date.getTime()) ? null : { date, hasTime }
  }
  const [y, m, d, h, min, s] = iso.slice(1, 7).map((part) => (part === undefined ? undefined : Number(part)))
  const date = saoPauloDate(y!, m!, d!, h ?? 0, min ?? 0, s ?? 0)
  return date ? { date, hasTime } : null
}

const hasCurrencySymbol = (value: unknown) => typeof value === 'string' && /R\$/i.test(value)

function share(values: unknown[], test: (value: unknown) => boolean) {
  return values.filter(test).length / values.length
}

export function inferFieldType(samples: unknown[]): FieldType {
  const values = samples.filter((value) => !isEmpty(value))
  if (values.length === 0) return 'text'
  if (share(values, (value) => parseBoolean(value) !== null) >= MATCH_RATIO) return 'boolean'
  if (share(values, (value) => parseNumber(value) !== null) >= MATCH_RATIO) {
    const strings = values.filter((value) => typeof value === 'string')
    return strings.length > 0 && share(strings, hasCurrencySymbol) >= CURRENCY_RATIO ? 'currency' : 'number'
  }
  const dates = values.map(parseDate)
  if (share(dates, (date) => date !== null) >= MATCH_RATIO) {
    return dates.some((date) => date?.hasTime) ? 'datetime' : 'date'
  }
  return 'text'
}

export type Normalized = { value: string | number | boolean | null; invalid: boolean }

const MAX_TEXT_LENGTH = 2000

export function normalizeValue(raw: unknown, type: FieldType): Normalized {
  if (isEmpty(raw)) return { value: null, invalid: false }
  const parsed = parseTyped(raw, type)
  return parsed === null ? { value: null, invalid: true } : { value: parsed, invalid: false }
}

function parseTyped(raw: unknown, type: FieldType): string | number | boolean | null {
  switch (type) {
    case 'number':
    case 'currency':
      return parseNumber(raw)
    case 'boolean':
      return parseBoolean(raw)
    case 'date':
    case 'datetime':
      return parseDate(raw)?.date.toISOString() ?? null
    case 'text': {
      const text = raw instanceof Date ? raw.toISOString() : typeof raw === 'object' ? JSON.stringify(raw) : String(raw)
      return text.trim().slice(0, MAX_TEXT_LENGTH)
    }
  }
}

export type FieldOverrides = { types?: Record<string, FieldType>; labels?: Record<string, string> }

/**
 * Field list for a source from its column keys and a sample of rows. Keeps types and labels the
 * user corrected earlier; `overrides` carries corrections made in the preview before the first capture.
 */
export function buildFields(
  keys: string[],
  sampleRows: Record<string, unknown>[],
  previous: SourceField[] = [],
  overrides: FieldOverrides = {},
): SourceField[] {
  return keys.map((key) => {
    const detectedType = inferFieldType(sampleRows.map((row) => row[key]))
    const before = previous.find((field) => field.key === key)
    const corrected = before && before.type !== before.detectedType ? before.type : undefined
    const label = overrides.labels?.[key]?.trim() || before?.label || key
    return { key, label, detectedType, type: overrides.types?.[key] ?? corrected ?? detectedType, invalidCount: 0 }
  })
}
