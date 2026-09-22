import { describe, expect, it } from 'vitest'
import { createTestDb } from '../../test/db.js'
import { seedSnapshotSource, sourceField } from '../../test/bi-fixtures.js'
import { datasetFor } from './dataset.js'
import { csvCell, listRows, streamRowsCsv } from './rows.js'

async function setup(count: number) {
  const db = await createTestDb()
  const rows = Array.from({ length: count }, (_, i) => ({
    nome: i === 0 ? 'Ana; "a Chefe"' : `Pessoa ${String(i).padStart(3, '0')}`,
    valor: i + 0.5,
    ativo: i % 2 === 0,
    data: '2026-01-05T03:00:00.000Z',
  }))
  const source = await seedSnapshotSource(db, {
    name: 'Pessoas',
    fields: [sourceField('nome', 'text'), sourceField('valor', 'currency'), sourceField('ativo', 'boolean'), sourceField('data', 'date')],
    rows,
  })
  return { db, input: { primary: await datasetFor(db, source.id) }, sourceId: source.id }
}

describe('listRows', () => {
  it('pages 100 rows at a time with the total', async () => {
    const { db, input } = await setup(150)
    const first = await listRows(db, input, { filters: [], calculatedFields: [] }, 1)
    const second = await listRows(db, input, { filters: [], calculatedFields: [] }, 2)
    expect(first.total).toBe(150)
    expect(first.rows).toHaveLength(100)
    expect(second.rows).toHaveLength(50)
    expect(first.columns.map((column) => column.label)).toEqual(['Nome', 'Valor', 'Ativo', 'Data'])
    expect(first.rows[0]).toEqual(['Ana; "a Chefe"', 0.5, true, '2026-01-05T03:00:00.000Z'])
  })

  it('applies filters', async () => {
    const { db, input, sourceId } = await setup(10)
    const result = await listRows(db, input, { filters: [{ sourceId, field: 'valor', op: 'gte', values: [8] }], calculatedFields: [] }, 1)
    expect(result.total).toBe(2)
  })
})

describe('CSV', () => {
  it('formats cells for Excel pt-BR', () => {
    expect(csvCell(1234.5, 'currency')).toBe('1234,5')
    expect(csvCell(true, 'boolean')).toBe('Sim')
    expect(csvCell('2026-01-05T03:00:00.000Z', 'date')).toBe('05/01/2026')
    expect(csvCell('2026-01-05T17:30:00.000Z', 'datetime')).toBe('05/01/2026 14:30')
    expect(csvCell('a;b', 'text')).toBe('"a;b"')
    expect(csvCell('diz "oi"\nfim', 'text')).toBe('"diz ""oi""\nfim"')
    expect(csvCell(null, 'text')).toBe('')
  })

  it('streams a BOM, the header and every row', async () => {
    const { db, input } = await setup(3)
    let csv = ''
    for await (const chunk of streamRowsCsv(db, input, { filters: [], calculatedFields: [] })) csv += chunk
    const lines = csv.split('\r\n')
    expect(csv.startsWith('﻿Nome;Valor;Ativo;Data\r\n')).toBe(true)
    expect(lines[1]).toBe('"Ana; ""a Chefe""";0,5;Sim;05/01/2026')
    expect(lines.filter(Boolean)).toHaveLength(4)
  })
})
