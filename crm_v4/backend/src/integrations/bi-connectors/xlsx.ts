import type { Readable } from 'node:stream'
import ExcelJS from 'exceljs'
import { DomainError } from '../../lib/errors.js'
import { recordsToRows, type SheetRecord } from './rows.js'

export type XlsxValue = string | number | boolean | Date | null

// ponytail: loads the whole workbook in memory (bounded by MAX_SPREADSHEET_BYTES on upload).
// exceljs 4.4's streaming WorkbookReader intermittently drops the last zip entry (in files written
// by exceljs itself that is xl/workbook.xml, and it then crashes most runs), so it is not usable.
// Upgrade path: a streaming reader that is reliable, if memory becomes the problem.
async function open(input: Readable | string): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook()
  try {
    await (typeof input === 'string' ? workbook.xlsx.readFile(input) : workbook.xlsx.read(input))
  } catch {
    throw new DomainError('VALIDATION_ERROR', 'Não consegui ler o arquivo .xlsx. Ele está corrompido?', 422)
  }
  return workbook
}

export async function listSheets(input: Readable | string): Promise<string[]> {
  return (await open(input)).worksheets.map((sheet) => sheet.name)
}

/** Rich text, hyperlinks and formulas become their visible text/result. */
export function cellValue(value: ExcelJS.CellValue): XlsxValue {
  if (value === null || value === undefined) return null
  if (value instanceof Date || typeof value !== 'object') return value
  if ('richText' in value) return value.richText.map((run) => run.text).join('')
  if ('hyperlink' in value) return value.text
  if ('result' in value) return cellValue(value.result ?? null)
  return null // error cells (#N/A, #DIV/0!) and formulas never calculated
}

async function* sheetRecords(sheet: ExcelJS.Worksheet): AsyncGenerator<SheetRecord<XlsxValue>> {
  for (let number = 1; number <= sheet.rowCount; number++) {
    const row = sheet.findRow(number)
    if (!row) continue
    // row.values is 1-based and sparse; Array.from fills the holes.
    yield { number, values: Array.from((row.values as ExcelJS.CellValue[]).slice(1), (v) => cellValue(v)) }
  }
}

export async function* readXlsx(
  input: Readable | string,
  { sheet, headerRow }: { sheet?: string; headerRow: number },
): AsyncGenerator<Record<string, XlsxValue>> {
  const workbook = await open(input)
  const worksheet = sheet === undefined ? workbook.worksheets[0] : workbook.getWorksheet(sheet)
  if (!worksheet) throw new DomainError('VALIDATION_ERROR', `A aba "${sheet ?? ''}" não existe na planilha.`, 422)
  yield* recordsToRows(sheetRecords(worksheet), headerRow, null)
}
