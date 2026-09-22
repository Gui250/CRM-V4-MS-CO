// The only place that turns a report component into SQL (research §2). Field names never reach the
// SQL text: every column is referenced by a generated alias (d0.c3) and snapshot keys are bound
// parameters. Aggregation runs in Postgres over a filtered "base" CTE.
import { sql, type SQL } from 'drizzle-orm'
import type { Db } from '../../db/client.js'
import { DomainError } from '../../lib/errors.js'
import type { Dataset } from './dataset.js'
import {
  CALCULATED_PREFIX,
  type Aggregation,
  type CalculatedField,
  type FieldRef,
  type FieldType,
  type Filter,
  type MeasureRef,
  type QueryRequest,
} from './definition.js'
import { compileExpression, parseExpression } from './expression.js'
import { OTHERS_LABEL, QUERY_TIMEOUT_MS, REPORT_TIME_ZONE } from './limits.js'
import { executeRows } from './sql.js'

export interface RelatedDataset {
  dataset: Dataset
  /** Field key in the primary dataset. */
  localField: string
  /** Field key in the related dataset. */
  remoteField: string
}

export interface CompileInput {
  primary: Dataset
  related?: RelatedDataset[]
}

export interface ResultColumn {
  key: string
  label: string
  type: FieldType
}

export interface CompiledQuery {
  query: SQL
  columns: ResultColumn[]
}

export const unknownField = (field: string) =>
  new DomainError('UNKNOWN_FIELD', `O campo "${field}" não existe na fonte de dados.`, 422)

const NUMERIC: FieldType[] = ['number', 'currency']
const DATES: FieldType[] = ['date', 'datetime']
const MAX_ROWS_WITHOUT_LIMIT = 5000

const AGGREGATION_LABEL: Record<Aggregation, string> = {
  sum: 'Soma',
  avg: 'Média',
  count: 'Contagem',
  count_distinct: 'Contagem distinta',
  min: 'Mínimo',
  max: 'Máximo',
}

type Resolved = { sql: SQL; type: FieldType; label: string }

/** Tracks which datasets and columns a query touches and hands out their aliases. */
export class Scope {
  private readonly used = new Map<number, Set<number>>()
  private readonly tables: { dataset: Dataset; join?: { localIndex: number; remoteIndex: number } }[]

  constructor(
    private readonly input: CompileInput,
    private readonly calculated: CalculatedField[] = [],
  ) {
    this.tables = [{ dataset: input.primary }]
  }

  get primary(): Dataset {
    return this.input.primary
  }

  /** Column reference usable in the base CTE (joins the related dataset on demand). */
  field(sourceId: string, key: string): Resolved {
    if (key.startsWith(CALCULATED_PREFIX)) return this.rowCalculated(key)
    const tableIndex = this.tableFor(sourceId)
    const fields = this.tables[tableIndex]!.dataset.fields
    const index = fields.findIndex((field) => field.key === key)
    if (index < 0) throw unknownField(key)
    return this.column(tableIndex, index)
  }

  /** Resolves a name written in a calculated field: label first (what users see), then key. */
  fieldByName(sourceId: string, name: string): Resolved {
    const table = this.tables[this.tableFor(sourceId)]!
    const lower = name.toLowerCase()
    const match =
      table.dataset.fields.find((field) => field.label.toLowerCase() === lower) ??
      table.dataset.fields.find((field) => field.key === name)
    if (!match) throw unknownField(name)
    return this.field(sourceId, match.key)
  }

  calculatedField(key: string): CalculatedField {
    const calc = this.calculated.find((candidate) => `${CALCULATED_PREFIX}${candidate.id}` === key)
    if (!calc) throw unknownField(key)
    return calc
  }

  /** `FROM d0 LEFT JOIN d1 ...` with only the used columns projected. */
  fromClause(): SQL {
    const parts = this.tables.map((table, index) => {
      const subquery = sql`(${this.projection(index)} ${table.dataset.from}) d${sql.raw(String(index))}`
      if (!table.join) return subquery
      const on = sql`d0.c${sql.raw(String(table.join.localIndex))} = d${sql.raw(String(index))}.c${sql.raw(String(table.join.remoteIndex))}`
      return sql`LEFT JOIN ${subquery} ON ${on}`
    })
    return sql`FROM ${sql.join(parts, sql` `)}`
  }

  /** Filter on a related source that is not joined: `local IN (SELECT remote FROM related WHERE ...)`. */
  relatedFilter(filter: Filter): SQL | null {
    const related = this.input.related?.find((candidate) => candidate.dataset.sourceId === filter.sourceId)
    if (!related) return null
    const fields = related.dataset.fields
    const target = fields.find((field) => field.key === filter.field)
    const remote = fields.find((field) => field.key === related.remoteField)
    if (!target || !remote) throw unknownField(filter.field)
    const local = this.field(this.primary.sourceId, related.localField)
    const condition = filterCondition({ sql: sql`r.rt`, type: target.type, label: target.label }, filter)
    return sql`${local.sql} IN (SELECT r.rk FROM (SELECT ${remote.expr} AS rk, ${target.expr} AS rt ${related.dataset.from}) r WHERE ${condition})`
  }

  private rowCalculated(key: string): Resolved {
    const calc = this.calculatedField(key)
    const parsed = parseExpression(calc.expression)
    if (parsed.isAggregate) {
      throw new DomainError('INVALID_EXPRESSION', `"${calc.name}" usa agregação e só pode ser usado como valor.`, 422)
    }
    const expr = compileExpression(parsed.ast, (name) => this.fieldByName(calc.sourceId, name))
    return { sql: expr, type: 'number', label: calc.name }
  }

  private tableFor(sourceId: string): number {
    if (sourceId === this.primary.sourceId) return 0
    const existing = this.tables.findIndex((table) => table.dataset.sourceId === sourceId)
    if (existing >= 0) return existing
    const related = this.input.related?.find((candidate) => candidate.dataset.sourceId === sourceId)
    if (!related) throw new DomainError('UNKNOWN_FIELD', 'O campo pertence a uma fonte sem relacionamento com esta.', 422)
    const localIndex = this.primary.fields.findIndex((field) => field.key === related.localField)
    const remoteIndex = related.dataset.fields.findIndex((field) => field.key === related.remoteField)
    if (localIndex < 0 || remoteIndex < 0) throw unknownField(related.localField)
    this.markUsed(0, localIndex)
    this.tables.push({ dataset: related.dataset, join: { localIndex, remoteIndex } })
    const tableIndex = this.tables.length - 1
    this.markUsed(tableIndex, remoteIndex)
    return tableIndex
  }

  private column(tableIndex: number, fieldIndex: number): Resolved {
    this.markUsed(tableIndex, fieldIndex)
    const field = this.tables[tableIndex]!.dataset.fields[fieldIndex]!
    return { sql: sql.raw(`d${tableIndex}.c${fieldIndex}`), type: field.type, label: field.label }
  }

  private markUsed(tableIndex: number, fieldIndex: number) {
    const set = this.used.get(tableIndex) ?? new Set<number>()
    set.add(fieldIndex)
    this.used.set(tableIndex, set)
  }

  private projection(tableIndex: number): SQL {
    const fields = this.tables[tableIndex]!.dataset.fields
    const indices = [...(this.used.get(tableIndex) ?? [])].sort((a, b) => a - b)
    if (indices.length === 0) return sql`SELECT 1 AS c_none`
    return sql`SELECT ${sql.join(
      indices.map((index) => sql`${fields[index]!.expr} AS ${sql.raw(`c${index}`)}`),
      sql`, `,
    )}`
  }
}

function castValue(value: string | number | boolean, type: FieldType): SQL {
  if (NUMERIC.includes(type)) {
    const number = typeof value === 'number' ? value : Number(String(value).replace(',', '.'))
    if (!Number.isFinite(number)) throw new DomainError('VALIDATION_ERROR', `"${value}" não é um número válido.`, 422)
    return sql`${number}::numeric`
  }
  if (DATES.includes(type)) return sql`${String(value)}::timestamptz`
  if (type === 'boolean') return sql`${value === true || value === 'true'}::boolean`
  return sql`${String(value)}::text`
}

function requireValues(filter: Filter, count: number) {
  if (filter.values.length < count) {
    throw new DomainError('VALIDATION_ERROR', `O filtro "${filter.op}" precisa de ${count} valor(es).`, 422)
  }
}

export function filterCondition(field: Resolved, filter: Filter): SQL {
  const values = () => sql.join(filter.values.map((value) => castValue(value, field.type)), sql`, `)
  switch (filter.op) {
    case 'in':
      return filter.values.length === 0 ? sql`false` : sql`${field.sql} IN (${values()})`
    case 'not_in':
      return filter.values.length === 0 ? sql`true` : sql`(${field.sql} IS NULL OR ${field.sql} NOT IN (${values()}))`
    case 'between':
      requireValues(filter, 2)
      return sql`${field.sql} BETWEEN ${castValue(filter.values[0]!, field.type)} AND ${castValue(filter.values[1]!, field.type)}`
    case 'gte':
      requireValues(filter, 1)
      return sql`${field.sql} >= ${castValue(filter.values[0]!, field.type)}`
    case 'lte':
      requireValues(filter, 1)
      return sql`${field.sql} <= ${castValue(filter.values[0]!, field.type)}`
    case 'is_null':
      return sql`${field.sql} IS NULL`
    case 'not_null':
      return sql`${field.sql} IS NOT NULL`
  }
}

/** WHERE clause for the filters that apply to this dataset; others are ignored (contract). */
export function whereClause(scope: Scope, filters: Filter[]): SQL {
  const conditions = filters.flatMap((filter) => {
    if (filter.sourceId === scope.primary.sourceId) return [filterCondition(scope.field(filter.sourceId, filter.field), filter)]
    const related = scope.relatedFilter(filter)
    return related ? [related] : []
  })
  return conditions.length === 0 ? sql`` : sql`WHERE ${sql.join(conditions, sql` AND `)}`
}

/** Same ISO-8601 UTC text from postgres-js and PGlite, whatever the session time zone. */
export const isoText = (expr: SQL) => sql`to_char(${expr} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`

const truncDate = (expr: SQL, grain: string) =>
  sql`(date_trunc(${sql.raw(`'${grain}'`)}, ${expr} AT TIME ZONE ${sql.raw(`'${REPORT_TIME_ZONE}'`)}) AT TIME ZONE ${sql.raw(`'${REPORT_TIME_ZONE}'`)})`

type Dimension = { input: SQL; column: ResultColumn; isDate: boolean }
type Measure = { inputs: SQL[]; aggregate: (base: (index: number) => SQL) => SQL; column: ResultColumn }

function compileDimension(scope: Scope, ref: FieldRef, index: number): Dimension {
  const field = scope.field(ref.sourceId, ref.field)
  const isDate = DATES.includes(field.type)
  const input = isDate && ref.dateGrain ? truncDate(field.sql, ref.dateGrain) : field.sql
  return { input, isDate, column: { key: `k${index}`, label: field.label, type: field.type } }
}

const AGGREGATE: Record<Aggregation, (arg: SQL) => SQL> = {
  sum: (arg) => sql`sum(${arg})`,
  avg: (arg) => sql`avg(${arg})`,
  count: (arg) => sql`count(${arg})`,
  count_distinct: (arg) => sql`count(DISTINCT ${arg})`,
  min: (arg) => sql`min(${arg})`,
  max: (arg) => sql`max(${arg})`,
}

function plainMeasure(field: Resolved, aggregation: Aggregation, key: string): Measure {
  const isCount = aggregation === 'count' || aggregation === 'count_distinct'
  const isDateExtreme = DATES.includes(field.type) && (aggregation === 'min' || aggregation === 'max')
  if (!isCount && !isDateExtreme && !NUMERIC.includes(field.type)) {
    throw new DomainError('VALIDATION_ERROR', `${AGGREGATION_LABEL[aggregation]} só funciona com campos numéricos.`, 422)
  }
  const type: FieldType = isCount ? 'number' : field.type
  return {
    inputs: [field.sql],
    aggregate: (base) =>
      isDateExtreme ? isoText(AGGREGATE[aggregation](base(0))) : sql`(${AGGREGATE[aggregation](base(0))})::float8`,
    column: { key, label: `${AGGREGATION_LABEL[aggregation]} de ${field.label}`, type },
  }
}

function compileMeasure(scope: Scope, ref: MeasureRef, index: number): Measure {
  const key = `m${index}`
  if (ref.field.startsWith(CALCULATED_PREFIX)) {
    const calc = scope.calculatedField(ref.field)
    const parsed = parseExpression(calc.expression)
    if (parsed.isAggregate) return aggregateCalculated(scope, calc, parsed.fieldNames, parsed.ast, key)
  }
  const field = scope.field(ref.sourceId, ref.field)
  const aggregation = ref.aggregation ?? (NUMERIC.includes(field.type) ? 'sum' : 'count')
  return plainMeasure(field, aggregation, key)
}

function aggregateCalculated(
  scope: Scope,
  calc: CalculatedField,
  names: string[],
  ast: ReturnType<typeof parseExpression>['ast'],
  key: string,
): Measure {
  const resolved = names.map((name) => scope.fieldByName(calc.sourceId, name))
  return {
    inputs: resolved.map((field) => field.sql),
    aggregate: (base) =>
      sql`(${compileExpression(ast, (name) => {
        const position = names.indexOf(name)
        return { sql: base(position), type: resolved[position]!.type }
      })})::float8`,
    column: { key, label: calc.name, type: 'number' },
  }
}

function outputKey(dimension: Dimension, index: number): SQL {
  const column = sql.raw(`base.k${index}`)
  return dimension.isDate ? sql`${isoText(column)} AS ${sql.raw(`k${index}`)}` : sql`${column} AS ${sql.raw(`k${index}`)}`
}

function orderBy(dimensions: Dimension[], measures: Measure[], request: QueryRequest, qualify: (name: string) => string) {
  const first = dimensions[0]
  const by = request.sort?.by ?? (first?.isDate || measures.length === 0 ? 'category' : 'value')
  const dir = request.sort?.dir ?? (by === 'category' ? 'asc' : 'desc')
  const target = by === 'value' && measures.length > 0 ? 'm0' : 'k0'
  return `${qualify(target)} ${dir.toUpperCase()} NULLS LAST`
}

export function compileQuery(input: CompileInput, request: QueryRequest): CompiledQuery {
  const scope = new Scope(input, request.calculatedFields)
  const dimensions = request.dimensions.map((ref, index) => compileDimension(scope, ref, index))
  const measures = request.measures.map((ref, index) => compileMeasure(scope, ref, index))
  const where = whereClause(scope, request.filters)

  const baseColumns = [
    ...dimensions.map((dimension, index) => sql`${dimension.input} AS ${sql.raw(`k${index}`)}`),
    ...measures.flatMap((measure, m) => measure.inputs.map((input, i) => sql`${input} AS ${sql.raw(`v${m}_${i}`)}`)),
  ]
  const base = sql`base AS (SELECT ${baseColumns.length ? sql.join(baseColumns, sql`, `) : sql`1 AS one`} ${scope.fromClause()} ${where})`
  const aggregates = measures.map((measure, m) => sql`${measure.aggregate((i) => sql.raw(`base.v${m}_${i}`))} AS ${sql.raw(`m${m}`)}`)
  const columns = [...dimensions.map((d) => d.column), ...measures.map((m) => m.column)]

  if (dimensions.length === 0) {
    return { query: sql`WITH ${base} SELECT ${sql.join(aggregates, sql`, `)} FROM base`, columns }
  }

  const useOthers = request.groupOthers && measures.length > 0 && !dimensions[0]!.isDate
  if (useOthers) return compileWithOthers(base, dimensions, measures, aggregates, request, columns)

  const groupBy = dimensions.map((_, index) => String(index + 1)).join(', ')
  const keys = dimensions.map((dimension, index) => outputKey(dimension, index))
  const order = orderBy(dimensions, measures, request, (name) => name)
  const query = sql`WITH ${base} SELECT ${sql.join([...keys, ...aggregates], sql`, `)} FROM base GROUP BY ${sql.raw(groupBy)}
    ORDER BY ${sql.raw(order)} LIMIT ${request.limit}`
  return { query, columns }
}

/** Top N values of the first dimension plus one "Outros" group recomputed from raw rows. */
function compileWithOthers(
  base: SQL,
  dimensions: Dimension[],
  measures: Measure[],
  aggregates: SQL[],
  request: QueryRequest,
  columns: ResultColumn[],
): CompiledQuery {
  const rank = measures[0]!.aggregate((i) => sql.raw(`base.v0_${i}`))
  const top = sql`top AS (SELECT base.k0 FROM base GROUP BY 1 ORDER BY ${rank} DESC NULLS LAST LIMIT ${request.limit})`
  const first = sql`CASE WHEN EXISTS (SELECT 1 FROM top WHERE top.k0 IS NOT DISTINCT FROM base.k0)
    THEN base.k0::text ELSE ${OTHERS_LABEL} END AS k0`
  const rest = dimensions.slice(1).map((dimension, index) => outputKey(dimension, index + 1))
  const groupBy = dimensions.map((_, index) => String(index + 1)).join(', ')
  const order = orderBy(dimensions, measures, request, (name) => `q.${name}`)
  const query = sql`WITH ${base}, ${top}
    SELECT * FROM (SELECT ${sql.join([first, ...rest, ...aggregates], sql`, `)} FROM base GROUP BY ${sql.raw(groupBy)}) q
    ORDER BY (q.k0 = ${OTHERS_LABEL}), ${sql.raw(order)} LIMIT ${MAX_ROWS_WITHOUT_LIMIT}`
  const withTextFirst = columns.map((column, index) => (index === 0 ? { ...column, type: 'text' as const } : column))
  return { query, columns: withTextFirst }
}

function toJsonValue(value: unknown, type: FieldType): unknown {
  if (value === null || value === undefined) return null
  if (value instanceof Date) return value.toISOString()
  if (NUMERIC.includes(type) && typeof value === 'string') return Number(value)
  if (typeof value === 'bigint') return Number(value)
  return value
}

export async function runQuery(db: Db, compiled: CompiledQuery): Promise<{ columns: ResultColumn[]; rows: unknown[][] }> {
  const rows = await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL statement_timeout = ${QUERY_TIMEOUT_MS}`))
    return executeRows<Record<string, unknown>>(tx as unknown as Db, compiled.query)
  })
  const keys = compiled.columns.map((column) => column.key)
  return {
    columns: compiled.columns,
    rows: rows.map((row) => keys.map((key, index) => toJsonValue(row[key], compiled.columns[index]!.type))),
  }
}
