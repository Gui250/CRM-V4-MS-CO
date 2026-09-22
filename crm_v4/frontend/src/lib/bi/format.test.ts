import { describe, expect, it } from 'vitest'
import { bucketRange, formatBucket, formatCell, formatNumber, nextGrain } from './format'

// Intl puts a no-break space between "R$" and the amount.
const plain = (s: string) => s.replace(/\s/g, ' ')

describe('formatNumber', () => {
  it('formats currency in BRL', () => expect(plain(formatNumber(1234.56, 'currency'))).toBe('R$ 1.234,56'))
  it('formats integers with thousand separators', () => expect(formatNumber(1234.6, 'integer')).toBe('1.235'))
  it('formats decimals with two places', () => expect(formatNumber(2.5, 'decimal')).toBe('2,50'))
  it('reads 0.25 as 25%', () => expect(plain(formatNumber(0.25, 'percent'))).toBe('25%'))
  it('defaults to up to two decimals', () => expect(formatNumber(1234.567)).toBe('1.234,57'))
  it('shows null as empty', () => expect(formatNumber(null)).toBe('(vazio)'))
})

describe('formatBucket (America/Sao_Paulo)', () => {
  const iso = '2026-01-05T03:00:00.000Z' // 05/01/2026 00:00 in São Paulo
  it('day', () => expect(formatBucket(iso, 'day')).toBe('05/01/2026'))
  it('week', () => expect(formatBucket(iso, 'week')).toBe('sem. 05/01'))
  it('month', () => expect(formatBucket(iso, 'month')).toBe('jan/2026'))
  it('quarter', () => expect(formatBucket('2026-08-01T03:00:00.000Z', 'quarter')).toBe('T3/2026'))
  it('year', () => expect(formatBucket(iso, 'year')).toBe('2026'))
  it('uses São Paulo, not UTC, for the calendar day', () =>
    expect(formatBucket('2026-02-01T01:00:00.000Z', 'month')).toBe('jan/2026'))
})

describe('bucketRange', () => {
  it('month: first instant to one ms before next month', () =>
    expect(bucketRange('2026-01-15T15:00:00.000Z', 'month')).toEqual(['2026-01-01T03:00:00.000Z', '2026-02-01T02:59:59.999Z']))
  it('week starts on Monday', () =>
    expect(bucketRange('2026-01-08T15:00:00.000Z', 'week')).toEqual(['2026-01-05T03:00:00.000Z', '2026-01-12T02:59:59.999Z']))
  it('quarter', () =>
    expect(bucketRange('2026-05-10T15:00:00.000Z', 'quarter')).toEqual(['2026-04-01T03:00:00.000Z', '2026-07-01T02:59:59.999Z']))
  it('year crosses into the next year', () =>
    expect(bucketRange('2026-12-31T20:00:00.000Z', 'year')).toEqual(['2026-01-01T03:00:00.000Z', '2027-01-01T02:59:59.999Z']))
  it('day', () =>
    expect(bucketRange('2026-03-10T03:00:00.000Z', 'day')).toEqual(['2026-03-10T03:00:00.000Z', '2026-03-11T02:59:59.999Z']))
  it('honours historical DST offsets (-02:00 in Jan 2018)', () =>
    expect(bucketRange('2018-01-15T12:00:00.000Z', 'day')[0]).toBe('2018-01-15T02:00:00.000Z'))
})

describe('formatCell', () => {
  it('null → (vazio)', () => expect(formatCell(null, 'text')).toBe('(vazio)'))
  it('booleans → Sim/Não', () => {
    expect(formatCell(true, 'boolean')).toBe('Sim')
    expect(formatCell(false, 'boolean')).toBe('Não')
  })
  it('date → dd/mm/aaaa', () => expect(formatCell('2026-01-05T03:00:00.000Z', 'date')).toBe('05/01/2026'))
  it('bare date keeps its calendar day', () => expect(formatCell('2026-01-05', 'date')).toBe('05/01/2026'))
  it('datetime → dd/mm/aaaa hh:mm', () => expect(formatCell('2026-01-05T13:30:00.000Z', 'datetime')).toBe('05/01/2026 10:30'))
  it('currency field defaults to BRL', () => expect(plain(formatCell(10, 'currency'))).toBe('R$ 10,00'))
  it('number format override', () => expect(plain(formatCell(0.5, 'number', 'percent'))).toBe('50%'))
  it('keeps Outros', () => expect(formatCell('Outros', 'text')).toBe('Outros'))
})

describe('nextGrain', () => {
  it('year → quarter → month → day → null', () => {
    expect(nextGrain('year')).toBe('quarter')
    expect(nextGrain('quarter')).toBe('month')
    expect(nextGrain('month')).toBe('day')
    expect(nextGrain('day')).toBeNull()
  })
})
