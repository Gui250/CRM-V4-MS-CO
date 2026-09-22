import { describe, expect, it } from 'vitest'
import { buildFields, inferFieldType, normalizeValue, parseDate, parseNumber } from './type-inference.js'

describe('parseNumber', () => {
  it.each([
    ['1.234,56', 1234.56],
    ['1,234.56', 1234.56],
    ['1234,5', 1234.5],
    ['12.5', 12.5],
    ['1.500', 1500],
    ['42', 42],
    ['-3,5', -3.5],
    ['R$ 1.234,56', 1234.56],
    ['12%', 0.12],
    [7, 7],
  ] as const)('parses %s', (input, expected) => {
    expect(parseNumber(input)).toBeCloseTo(expected)
  })

  it.each(['n/d', '12abc', '', '1,2,3', 'R$'])('rejects %s', (input) => {
    expect(parseNumber(input)).toBeNull()
  })
})

describe('parseDate', () => {
  it('reads dd/mm/aaaa as a São Paulo calendar day', () => {
    expect(parseDate('05/01/2026')).toEqual({ date: new Date('2026-01-05T03:00:00.000Z'), hasTime: false })
  })

  it('reads times and ISO dates', () => {
    expect(parseDate('05/01/2026 14:30')?.date.toISOString()).toBe('2026-01-05T17:30:00.000Z')
    expect(parseDate('2026-01-05')?.date.toISOString()).toBe('2026-01-05T03:00:00.000Z')
    expect(parseDate('2026-01-05T10:00:00Z')).toEqual({ date: new Date('2026-01-05T10:00:00Z'), hasTime: true })
  })

  it('keeps the calendar day of spreadsheet dates', () => {
    expect(parseDate(new Date(Date.UTC(2026, 0, 5)))?.date.toISOString()).toBe('2026-01-05T03:00:00.000Z')
  })

  it.each(['31/02/2026', '2026-13-01', 'ontem', '5/1/26'])('rejects %s', (input) => {
    expect(parseDate(input)).toBeNull()
  })
})

describe('inferFieldType', () => {
  it.each([
    [['sim', 'não', 'Sim', ''], 'boolean'],
    [['1.234,56', '10', '-3,5'], 'number'],
    [['R$ 10,00', 'R$ 1.200,00', 'R$ 5'], 'currency'],
    [['05/01/2026', '2026-02-10'], 'date'],
    [['05/01/2026 10:00', '06/01/2026'], 'datetime'],
    [['Ana', 'Bruno'], 'text'],
    [['', null, undefined], 'text'],
    [[1, 2.5, 3], 'number'],
    [[true, false], 'boolean'],
  ] as const)('%j → %s', (samples, expected) => {
    expect(inferFieldType([...samples])).toBe(expected)
  })

  it('tolerates up to 5% of invalid values', () => {
    const samples = [...Array.from({ length: 19 }, (_, i) => String(i)), 'n/d']
    expect(inferFieldType(samples)).toBe('number')
    expect(inferFieldType([...samples, 'x'])).toBe('text')
  })
})

describe('normalizeValue', () => {
  it('normalizes by type and flags invalid values', () => {
    expect(normalizeValue('R$ 1.234,56', 'currency')).toEqual({ value: 1234.56, invalid: false })
    expect(normalizeValue('n/d', 'number')).toEqual({ value: null, invalid: true })
    expect(normalizeValue('05/01/2026', 'date')).toEqual({ value: '2026-01-05T03:00:00.000Z', invalid: false })
    expect(normalizeValue('Sim', 'boolean')).toEqual({ value: true, invalid: false })
    expect(normalizeValue({ a: 1 }, 'text')).toEqual({ value: '{"a":1}', invalid: false })
    expect(normalizeValue('  ', 'number')).toEqual({ value: null, invalid: false })
  })
})

describe('buildFields', () => {
  it('detects types and keeps types and labels corrected by the user', () => {
    const rows = [{ vendedor: 'Ana', valor: '10' }, { vendedor: 'Bruno', valor: '20' }]
    const previous = [{ key: 'valor', label: 'Valor (R$)', detectedType: 'number' as const, type: 'text' as const, invalidCount: 0 }]
    expect(buildFields(['vendedor', 'valor'], rows, previous)).toEqual([
      { key: 'vendedor', label: 'vendedor', detectedType: 'text', type: 'text', invalidCount: 0 },
      { key: 'valor', label: 'Valor (R$)', detectedType: 'number', type: 'text', invalidCount: 0 },
    ])
  })
})
