import { describe, expect, it } from 'vitest'
import {
  displayName,
  formatBRL,
  formatBytes,
  formatDayLabel,
  formatListTime,
  formatPhone,
  formatTimeInStage,
  initials,
  parseBRL,
  centsToInput,
} from './format'

const now = new Date(2026, 8, 22, 15, 0)
const at = (day: number, hour = 9, minute = 5) => new Date(2026, 8, day, hour, minute).toISOString()

describe('format', () => {
  it('shows HH:mm for today, "Ontem" for yesterday, and the date otherwise in the list', () => {
    expect(formatListTime(at(22), now)).toBe('09:05')
    expect(formatListTime(at(21), now)).toBe('Ontem')
    expect(formatListTime(at(15), now)).toBe('15/09/2026')
  })

  it('labels day separators', () => {
    expect(formatDayLabel(at(22), now)).toBe('Hoje')
    expect(formatDayLabel(at(21), now)).toBe('Ontem')
    expect(formatDayLabel(at(1), now)).toBe('01/09/2026')
  })

  it('formats Brazilian phone numbers and falls back to +digits', () => {
    expect(formatPhone('5511987654321')).toBe('+55 11 98765-4321')
    expect(formatPhone('551134567890')).toBe('+55 11 3456-7890')
    expect(formatPhone('14155552671')).toBe('+14155552671')
  })

  it('uses the name, or the formatted phone, as display name and for initials', () => {
    expect(displayName({ name: 'Ana Souza', phone: '5511987654321' })).toBe('Ana Souza')
    expect(displayName({ name: null, phone: '5511987654321' })).toBe('+55 11 98765-4321')
    expect(initials({ name: 'Ana Maria Souza', phone: '' })).toBe('AS')
    expect(initials({ name: 'Ana', phone: '' })).toBe('A')
    expect(initials({ name: null, phone: '5511987654321' })).toBe('21')
  })

  it('formats file sizes', () => {
    expect(formatBytes(500)).toBe('500 B')
    expect(formatBytes(2048)).toBe('2 KB')
    expect(formatBytes(5 * 1024 * 1024 + 300_000)).toBe('5,3 MB')
  })
})

describe('lead formatting', () => {
  const plain = (text: string) => text.replace(/\s/g, ' ')

  it('formats cents as reais, and a missing value as a dash', () => {
    expect(plain(formatBRL(500000))).toBe('R$ 5.000,00')
    expect(plain(formatBRL(0))).toBe('R$ 0,00')
    expect(formatBRL(null)).toBe('—')
  })

  it('formats time in stage from minutes to days', () => {
    const since = (minutes: number) => new Date(now.getTime() - minutes * 60_000).toISOString()
    expect(formatTimeInStage(since(0), now)).toBe('agora')
    expect(formatTimeInStage(since(5), now)).toBe('5 min')
    expect(formatTimeInStage(since(3 * 60 + 10), now)).toBe('3 h')
    expect(formatTimeInStage(since(2 * 24 * 60 + 1), now)).toBe('2 d')
  })
})

describe('money input', () => {
  it('parses pt-BR amounts to cents, blank to null, junk to undefined', () => {
    expect(parseBRL('5.000,00')).toBe(500000)
    expect(parseBRL('R$ 5.000,5')).toBe(500050)
    expect(parseBRL('1234')).toBe(123400)
    expect(parseBRL('  ')).toBeNull()
    expect(parseBRL('12,345')).toBeUndefined()
    expect(parseBRL('abc')).toBeUndefined()
    expect(parseBRL('-10')).toBeUndefined()
  })

  it('formats cents back for editing', () => {
    expect(centsToInput(500050)).toBe('5.000,50')
    expect(centsToInput(null)).toBe('')
  })
})
