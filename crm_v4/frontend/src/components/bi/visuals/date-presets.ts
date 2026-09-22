import { bucketRange } from '@/lib/bi/format'
import { REPORT_TIME_ZONE } from '@/lib/bi/types'

const DAY_MS = 86_400_000

export const DATE_PRESETS = [
  { id: '7d', label: 'Últimos 7 dias', days: 7 },
  { id: '30d', label: 'Últimos 30 dias', days: 30 },
  { id: '90d', label: 'Últimos 90 dias', days: 90 },
  { id: 'month', label: 'Mês atual' },
  { id: 'year', label: 'Ano atual' },
] as const

export type PresetId = (typeof DATE_PRESETS)[number]['id']

/** `[start, end]` in São Paulo time: whole days, the current one included. */
export function presetRange(id: PresetId, now = new Date()): [string, string] {
  const preset = DATE_PRESETS.find((p) => p.id === id)!
  if (!('days' in preset)) return bucketRange(now.toISOString(), id === 'month' ? 'month' : 'year')
  const first = new Date(now.getTime() - (preset.days - 1) * DAY_MS)
  return [bucketRange(first.toISOString(), 'day')[0], bucketRange(now.toISOString(), 'day')[1]]
}

/** Calendar days picked in `<input type="date">` (yyyy-mm-dd) → São Paulo range. Noon avoids any offset edge. */
export const dayRange = (from: string, to: string): [string, string] => [
  bucketRange(`${from}T12:00:00-03:00`, 'day')[0],
  bucketRange(`${to}T12:00:00-03:00`, 'day')[1],
]

const dayFormat = new Intl.DateTimeFormat('en-CA', { timeZone: REPORT_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' })

/** yyyy-mm-dd of an instant, in São Paulo. */
export const toDayInput = (iso: string) => (Number.isNaN(Date.parse(iso)) ? '' : dayFormat.format(new Date(iso)))
