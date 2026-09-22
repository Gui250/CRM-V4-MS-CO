// "Ver dados" (FR-020): the raw rows behind a component, paginated or as a CSV download.
import { sql, type SQL } from 'drizzle-orm'
import type { Db } from '../../db/client.js'
import type { CalculatedField, FieldType, Filter } from './definition.js'
import { MAX_SOURCE_ROWS, QUERY_TIMEOUT_MS, REPORT_TIME_ZONE, ROWS_PAGE_SIZE } from './limits.js'
import { isoText, Scope, whereClause, type CompileInput, type ResultColumn } from './query-compiler.js'
import { executeRows } from './sql.js'

export type RowsRequest = { filters: Filter[]; calculatedFields: CalculatedField[] }

const CSV_BATCH_ROWS = 5000
const DATES: FieldType[] = ['date', 'datetime']
const NUMERIC: FieldType[] = ['number', 'currency']

function compileRows(input: CompileInput, request: RowsRequest) {
  const scope = new Scope(input, request.calculatedFields)
  const fields = input.primary.fields.map((field) => ({ ...scope.field(input.primary.sourceId, field.key), field }))
  const where = whereClause(scope, request.filters)
  const from = scope.fromClause()
  const columns: ResultColumn[] = fields.map(({ field }) => ({ key: field.key, label: field.label, type: field.type }))
  const select = sql.join(
    fields.map((resolved, index) => {
      const value = DATES.includes(resolved.type) ? isoText(resolved.sql) : resolved.sql
      return sql`${value} AS ${sql.raw(`r${index}`)}`
    }),
    sql`, `,
  )
  return { columns, select: (limit: number, offset: number) => sql`SELECT ${select} ${from} ${where} ORDER BY 1 LIMIT ${limit} OFFSET ${offset}`, count: sql`SELECT count(*)::int AS total ${from} ${where}` }
}

async function readRows(db: Db, query: SQL, columns: ResultColumn[]): Promise<unknown[][]> {
  const rows = await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL statement_timeout = ${QUERY_TIMEOUT_MS}`))
    return executeRows<Record<string, unknown>>(tx as unknown as Db, query)
  })
  return rows.map((row) =>
    columns.map((column, index) => {
      const value = row[`r${index}`] ?? null
      return NUMERIC.includes(column.type) && typeof value === 'string' ? Number(value) : value
    }),
  )
}

export async function listRows(db: Db, input: CompileInput, request: RowsRequest, page: number) {
  const compiled = compileRows(input, request)
  const [countRow] = await executeRows<{ total: number }>(db, compiled.count)
  const rows = await readRows(db, compiled.select(ROWS_PAGE_SIZE, (page - 1) * ROWS_PAGE_SIZE), compiled.columns)
  return { columns: compiled.columns, rows, total: countRow?.total ?? 0 }
}

const pad = (value: number) => String(value).padStart(2, '0')

function formatDate(iso: string, type: FieldType): string {
  const date = new Date(iso)
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('pt-BR', { timeZone: REPORT_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  )
  const day = `${parts.day}/${parts.month}/${parts.year}`
  return type === 'date' ? day : `${day} ${pad(Number(parts.hour))}:${parts.minute}`
}

/** One CSV cell in the format Excel pt-BR opens correctly: `;` separator and decimal comma. */
export function csvCell(value: unknown, type: FieldType): string {
  if (value === null || value === undefined) return ''
  let text: string
  if (typeof value === 'number') text = String(value).replace('.', ',')
  else if (typeof value === 'boolean') text = value ? 'Sim' : 'Não'
  else if (DATES.includes(type) && typeof value === 'string') text = formatDate(value, type)
  else text = String(value)
  return /[";\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

const csvLine = (cells: string[]) => `${cells.join(';')}\r\n`

/** Streams the CSV in batches; capped at the source row limit. */
export async function* streamRowsCsv(db: Db, input: CompileInput, request: RowsRequest): AsyncGenerator<string> {
  const compiled = compileRows(input, request)
  yield `﻿${csvLine(compiled.columns.map((column) => csvCell(column.label, 'text')))}`
  // ponytail: OFFSET paging rescans earlier rows; switch to keyset on row_num if 500k exports get slow.
  for (let offset = 0; offset < MAX_SOURCE_ROWS; offset += CSV_BATCH_ROWS) {
    const rows = await readRows(db, compiled.select(Math.min(CSV_BATCH_ROWS, MAX_SOURCE_ROWS - offset), offset), compiled.columns)
    if (rows.length === 0) return
    yield rows.map((row) => csvLine(row.map((value, index) => csvCell(value, compiled.columns[index]!.type)))).join('')
    if (rows.length < CSV_BATCH_ROWS) return
  }
}
