const pad = (n: number) => String(n).padStart(2, '0')

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

function daysAgo(date: Date, now: Date) {
  return Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000)
}

export const formatTime = (iso: string) => {
  const date = new Date(iso)
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export const formatDate = (date: Date) => `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`

/** Conversation list: today → HH:mm, yesterday → "Ontem", else dd/MM/yyyy. */
export function formatListTime(iso: string, now = new Date()) {
  const date = new Date(iso)
  const diff = daysAgo(date, now)
  if (diff === 0) return formatTime(iso)
  if (diff === 1) return 'Ontem'
  return formatDate(date)
}

/** Day separators in the thread. */
export function formatDayLabel(iso: string, now = new Date()) {
  const date = new Date(iso)
  const diff = daysAgo(date, now)
  if (diff === 0) return 'Hoje'
  if (diff === 1) return 'Ontem'
  return formatDate(date)
}

export const isSameDay = (a: string, b: string) => startOfDay(new Date(a)) === startOfDay(new Date(b))

/** Brazilian numbers: 5511987654321 → +55 11 98765-4321. Others keep a leading "+". */
export function formatPhone(phone: string) {
  const digits = phone.replace(/\D/g, '')
  const br = /^55(\d{2})(\d{4,5})(\d{4})$/.exec(digits)
  if (br) return `+55 ${br[1]} ${br[2]}-${br[3]}`
  return digits ? `+${digits}` : phone
}

export const displayName = (contact: { name: string | null; phone: string }) =>
  contact.name?.trim() || formatPhone(contact.phone)

export function initials(contact: { name: string | null; phone: string }) {
  const words = contact.name?.trim().split(/\s+/).filter(Boolean) ?? []
  if (words.length === 0) return contact.phone.slice(-2)
  return ((words[0]?.[0] ?? '') + (words.length > 1 ? (words.at(-1)?.[0] ?? '') : '')).toUpperCase()
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`
}

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

/** Lead values are stored in cents. */
export const formatBRL = (cents: number | null) => (cents === null ? '—' : brl.format(cents / 100))

/** How long a lead has been in its current stage: "agora", "5 min", "3 h", "2 d". */
export function formatTimeInStage(iso: string, now = new Date()) {
  const minutes = Math.floor((now.getTime() - new Date(iso).getTime()) / 60_000)
  if (minutes < 1) return 'agora'
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} h`
  return `${Math.floor(hours / 24)} d`
}

/** "5.000,50" / "R$ 5000" → cents; blank → null; anything else → undefined (invalid). */
export function parseBRL(text: string): number | null | undefined {
  const cleaned = text.replace(/R\$|\s/g, '')
  if (!cleaned) return null
  if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+(,\d{1,2})?$/.test(cleaned)) return undefined
  const [reais = '0', centavos = ''] = cleaned.replace(/\./g, '').split(',')
  return Number(reais) * 100 + Number(centavos.padEnd(2, '0'))
}

/** Cents as an editable pt-BR number, without the currency symbol: 500050 → "5.000,50". */
export const centsToInput = (cents: number | null) =>
  cents === null ? '' : (cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
