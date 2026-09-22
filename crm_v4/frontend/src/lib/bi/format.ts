import { OTHERS_LABEL, REPORT_TIME_ZONE, type DateGrain, type FieldType, type NumberFormat } from './types'

export const EMPTY_LABEL = '(vazio)'
const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

const numberFormats: Record<NumberFormat | 'default', Intl.NumberFormat> = {
  default: new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }),
  integer: new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }),
  decimal: new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  currency: new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }),
  percent: new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 1 }),
}

/** pt-BR number; `percent` reads 0.25 as 25%. */
export function formatNumber(value: number | null | undefined, format?: NumberFormat) {
  if (value === null || value === undefined || Number.isNaN(value)) return EMPTY_LABEL
  return numberFormats[format ?? 'default'].format(value)
}

// ---------------------------------------------------------------- São Paulo wall clock
// Buckets are computed on São Paulo's calendar (the backend groups in that zone). Brazil has had
// no DST since 2019, but older data did, so offsets come from Intl instead of a fixed -03:00.

type Wall = { y: number; m: number; d: number; h: number; min: number }

const wallFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: REPORT_TIME_ZONE,
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
  second: 'numeric',
  hourCycle: 'h23',
})

function wallClock(ms: number): Wall & { s: number } {
  const parts: Record<string, number> = {}
  for (const part of wallFormat.formatToParts(new Date(ms))) parts[part.type] = Number(part.value)
  return { y: parts.year!, m: parts.month!, d: parts.day!, h: parts.hour!, min: parts.minute!, s: parts.second! }
}

const offsetAt = (ms: number) => {
  const w = wallClock(ms)
  return Date.UTC(w.y, w.m - 1, w.d, w.h, w.min, w.s) - Math.floor(ms / 1000) * 1000
}

/** Instant of São Paulo midnight on the given calendar day (month is 1-based; overflow normalizes). */
function midnight(y: number, m: number, d: number) {
  const asUtc = Date.UTC(y, m - 1, d)
  const guess = asUtc - offsetAt(asUtc)
  return asUtc - offsetAt(guess)
}

function bucketStartWall({ y, m, d }: Wall, grain: DateGrain): [number, number, number] {
  switch (grain) {
    case 'day':
      return [y, m, d]
    case 'week': {
      // ISO weeks start on Monday, like Postgres date_trunc('week').
      const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
      return [y, m, d - ((weekday + 6) % 7)]
    }
    case 'month':
      return [y, m, 1]
    case 'quarter':
      return [y, Math.floor((m - 1) / 3) * 3 + 1, 1]
    case 'year':
      return [y, 1, 1]
  }
}

const STEP: Record<DateGrain, [number, number, number]> = {
  day: [0, 0, 1],
  week: [0, 0, 7],
  month: [0, 1, 0],
  quarter: [0, 3, 0],
  year: [1, 0, 0],
}

/** `[start, end]` of the bucket containing `iso`; end is the next bucket start − 1 ms (inclusive `between`). */
export function bucketRange(iso: string, grain: DateGrain): [string, string] {
  const [y, m, d] = bucketStartWall(wallClock(new Date(iso).getTime()), grain)
  const [dy, dm, dd] = STEP[grain]
  const start = midnight(y, m, d)
  const next = midnight(y + dy, m + dm, d + dd)
  return [new Date(start).toISOString(), new Date(next - 1).toISOString()]
}

const pad = (n: number) => String(n).padStart(2, '0')

export function formatBucket(iso: string, grain: DateGrain) {
  const time = new Date(iso).getTime()
  if (Number.isNaN(time)) return iso
  const { y, m, d } = wallClock(time)
  switch (grain) {
    case 'day':
      return `${pad(d)}/${pad(m)}/${y}`
    case 'week':
      return `sem. ${pad(d)}/${pad(m)}`
    case 'month':
      return `${MONTHS[m - 1]}/${y}`
    case 'quarter':
      return `T${Math.floor((m - 1) / 3) + 1}/${y}`
    case 'year':
      return String(y)
  }
}

const NEXT_GRAIN: Record<DateGrain, DateGrain | null> = { year: 'quarter', quarter: 'month', month: 'day', week: 'day', day: null }
/** Drill-down order: year → quarter → month → day. */
export const nextGrain = (grain: DateGrain) => NEXT_GRAIN[grain]

export function formatCell(value: unknown, fieldType: FieldType, numberFormat?: NumberFormat): string {
  if (value === null || value === undefined || value === '') return EMPTY_LABEL
  if (value === OTHERS_LABEL) return OTHERS_LABEL
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não'
  switch (fieldType) {
    case 'number':
    case 'currency': {
      const n = Number(value)
      if (Number.isNaN(n)) return String(value)
      return formatNumber(n, numberFormat ?? (fieldType === 'currency' ? 'currency' : undefined))
    }
    case 'date':
    case 'datetime': {
      // A bare calendar date has no zone; converting it would shift it to the previous day.
      const plain = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value))
      if (plain) return `${plain[3]}/${plain[2]}/${plain[1]}`
      const time = new Date(String(value)).getTime()
      if (Number.isNaN(time)) return String(value)
      const w = wallClock(time)
      const day = `${pad(w.d)}/${pad(w.m)}/${w.y}`
      return fieldType === 'date' ? day : `${day} ${pad(w.h)}:${pad(w.min)}`
    }
    case 'boolean':
      return value === 'true' ? 'Sim' : value === 'false' ? 'Não' : String(value)
    default:
      return String(value)
  }
}
