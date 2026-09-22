import { PassThrough, Readable } from 'node:stream'
import ExcelJS from 'exceljs'
import { beforeAll, describe, expect, it } from 'vitest'
import { MAX_SOURCE_ROWS } from '../../models/bi/limits.js'
import { cellValue, listSheets, readXlsx } from './xlsx.js'

async function collect<T>(rows: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = []
  for await (const row of rows) out.push(row)
  return out
}

let workbook: Buffer

beforeAll(async () => {
  const book = new ExcelJS.Workbook()
  const summary = book.addWorksheet('Resumo')
  summary.addRow(['métrica', 'valor'])
  summary.addRow(['total', 3])
  const sales = book.addWorksheet('Vendas')
  sales.addRow(['Relatório de vendas'])
  sales.addRow([])
  sales.addRow(['cliente', 'data', 'valor', 'site'])
  sales.addRow([{ richText: [{ text: 'Ana ' }, { text: 'Souza' }] }, new Date(Date.UTC(2024, 0, 15)), 10.5, { text: 'v4', hyperlink: 'https://v4.com' }])
  sales.addRow(['Bia', null, { formula: 'C4*2', result: 21 }, null])
  workbook = Buffer.from(await book.xlsx.writeBuffer())
})

const input = () => Readable.from([workbook])

describe('listSheets', () => {
  it('lists the sheets in workbook order', async () => {
    expect(await listSheets(input())).toEqual(['Resumo', 'Vendas'])
  })
})

describe('readXlsx', () => {
  it('reads the first sheet when none is chosen', async () => {
    expect(await collect(readXlsx(input(), { headerRow: 1 }))).toEqual([{ métrica: 'total', valor: 3 }])
  })

  it('reads the chosen sheet from the header row, flattening cell values', async () => {
    const rows = await collect(readXlsx(input(), { sheet: 'Vendas', headerRow: 3 }))

    expect(rows).toEqual([
      { cliente: 'Ana Souza', data: new Date(Date.UTC(2024, 0, 15)), valor: 10.5, site: 'v4' },
      { cliente: 'Bia', data: null, valor: 21, site: null },
    ])
  })

  it('returns dates as JS Date', async () => {
    const [first] = await collect(readXlsx(input(), { sheet: 'Vendas', headerRow: 3 }))

    expect(first?.data).toBeInstanceOf(Date)
  })

  it('rejects a sheet that does not exist', async () => {
    await expect(collect(readXlsx(input(), { sheet: 'Nada', headerRow: 1 }))).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    })
  })

  it('stops with TOO_MANY_ROWS one row past the limit', async () => {
    const out = new PassThrough()
    const chunks: Buffer[] = []
    out.on('data', (c: Buffer) => chunks.push(c))
    const writer = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: out, useSharedStrings: false })
    const sheet = writer.addWorksheet('big')
    sheet.addRow(['n']).commit()
    for (let i = 0; i <= MAX_SOURCE_ROWS; i++) sheet.addRow([i]).commit()
    await writer.commit()

    await expect(collect(readXlsx(Readable.from([Buffer.concat(chunks)]), { headerRow: 1 }))).rejects.toMatchObject({
      code: 'TOO_MANY_ROWS',
    })
  }, 120_000)
})

describe('cellValue', () => {
  it('turns error cells into null', () => {
    expect(cellValue({ error: '#N/A' })).toBeNull()
  })
})
