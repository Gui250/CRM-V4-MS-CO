// Calculated fields (FR-007): numbers, [Field] references, + - * /, parentheses and the aggregate
// functions below. Parsed to an AST and compiled to parameterized SQL; nothing is ever evaluated.
import { sql, type SQL } from 'drizzle-orm'
import { DomainError } from '../../lib/errors.js'
import type { FieldType } from './definition.js'
import { MAX_EXPRESSION_LENGTH } from './limits.js'

const FUNCTIONS = { SUM: 'sum', AVG: 'avg', COUNT: 'count', COUNT_DISTINCT: 'count_distinct', MIN: 'min', MAX: 'max' } as const
type AggregateFn = (typeof FUNCTIONS)[keyof typeof FUNCTIONS]

export type ExpressionNode =
  | { kind: 'number'; value: number }
  | { kind: 'field'; name: string }
  | { kind: 'aggregate'; fn: AggregateFn; arg: ExpressionNode }
  | { kind: 'binary'; op: '+' | '-' | '*' | '/'; left: ExpressionNode; right: ExpressionNode }
  | { kind: 'negate'; arg: ExpressionNode }

export interface ParsedExpression {
  ast: ExpressionNode
  isAggregate: boolean
  fieldNames: string[]
}

const invalid = (message: string, position?: number) =>
  new DomainError(
    'INVALID_EXPRESSION',
    position === undefined ? `Expressão inválida: ${message}` : `Expressão inválida na posição ${position + 1}: ${message}`,
    422,
  )

type Token = { type: 'number' | 'field' | 'name' | 'op'; text: string; pos: number }

const TOKEN = /\s*(?:(\d+(?:[.,]\d+)?)|\[([^\]]+)\]|([A-Za-z_]+)|([-+*/()]))/y

function tokenize(input: string): Token[] {
  const tokens: Token[] = []
  TOKEN.lastIndex = 0
  while (TOKEN.lastIndex < input.length) {
    const start = TOKEN.lastIndex
    const match = TOKEN.exec(input)
    if (!match) {
      const rest = input.slice(start)
      if (rest.trim() === '') break
      throw invalid(`caractere inesperado "${rest.trim()[0]}"`, start + rest.length - rest.trimStart().length)
    }
    const [whole, number, fieldName, name, op] = match
    const pos = start + whole.length - whole.trimStart().length
    if (number !== undefined) tokens.push({ type: 'number', text: number.replace(',', '.'), pos })
    else if (fieldName !== undefined) tokens.push({ type: 'field', text: fieldName.trim(), pos })
    else if (name !== undefined) tokens.push({ type: 'name', text: name.toUpperCase(), pos })
    else tokens.push({ type: 'op', text: op!, pos })
  }
  return tokens
}

class Parser {
  private index = 0
  constructor(private readonly tokens: Token[]) {}

  parse(): ExpressionNode {
    if (this.tokens.length === 0) throw invalid('a expressão está vazia')
    const node = this.additive()
    const extra = this.tokens[this.index]
    if (extra) throw invalid(`"${extra.text}" sobrando`, extra.pos)
    return node
  }

  private peek = () => this.tokens[this.index]

  private accept(text: string): boolean {
    if (this.peek()?.type === 'op' && this.peek()?.text === text) {
      this.index++
      return true
    }
    return false
  }

  private expect(text: string) {
    const token = this.peek()
    if (!this.accept(text)) throw invalid(`esperava "${text}"`, token?.pos)
  }

  private additive(): ExpressionNode {
    let node = this.multiplicative()
    for (let op = this.operator('+', '-'); op; op = this.operator('+', '-')) {
      node = { kind: 'binary', op, left: node, right: this.multiplicative() }
    }
    return node
  }

  private multiplicative(): ExpressionNode {
    let node = this.unary()
    for (let op = this.operator('*', '/'); op; op = this.operator('*', '/')) {
      node = { kind: 'binary', op, left: node, right: this.unary() }
    }
    return node
  }

  private operator<T extends '+' | '-' | '*' | '/'>(...ops: T[]): T | undefined {
    return ops.find((op) => this.accept(op))
  }

  private unary(): ExpressionNode {
    if (this.accept('-')) return { kind: 'negate', arg: this.unary() }
    return this.primary()
  }

  private primary(): ExpressionNode {
    const token = this.peek()
    if (!token) throw invalid('a expressão terminou antes do esperado')
    this.index++
    if (token.type === 'number') return { kind: 'number', value: Number(token.text) }
    if (token.type === 'field') return { kind: 'field', name: token.text }
    if (token.type === 'name') return this.call(token)
    if (token.text === '(') {
      const node = this.additive()
      this.expect(')')
      return node
    }
    throw invalid(`"${token.text}" inesperado`, token.pos)
  }

  private call(token: Token): ExpressionNode {
    const fn = FUNCTIONS[token.text as keyof typeof FUNCTIONS]
    if (!fn) throw invalid(`função desconhecida "${token.text}"; use SUM, AVG, COUNT, COUNT_DISTINCT, MIN ou MAX`, token.pos)
    this.expect('(')
    const arg = this.additive()
    this.expect(')')
    return { kind: 'aggregate', fn, arg }
  }
}

function collect(node: ExpressionNode, insideAggregate: boolean, out: { fields: string[]; aggregates: number; bareFields: number }) {
  switch (node.kind) {
    case 'number':
      return
    case 'field':
      out.fields.push(node.name)
      if (!insideAggregate) out.bareFields++
      return
    case 'aggregate':
      if (insideAggregate) throw invalid('não é possível usar uma agregação dentro de outra')
      out.aggregates++
      return collect(node.arg, true, out)
    case 'negate':
      return collect(node.arg, insideAggregate, out)
    case 'binary':
      collect(node.left, insideAggregate, out)
      return collect(node.right, insideAggregate, out)
  }
}

export function parseExpression(text: string): ParsedExpression {
  if (text.length > MAX_EXPRESSION_LENGTH) throw invalid(`use no máximo ${MAX_EXPRESSION_LENGTH} caracteres`)
  const ast = new Parser(tokenize(text)).parse()
  const info = { fields: [] as string[], aggregates: 0, bareFields: 0 }
  collect(ast, false, info)
  if (info.aggregates > 0 && info.bareFields > 0) {
    throw invalid('ao usar SUM, AVG, COUNT, MIN ou MAX, todos os campos precisam estar dentro de uma agregação')
  }
  return { ast, isAggregate: info.aggregates > 0, fieldNames: [...new Set(info.fields)] }
}

export type FieldResolver = (name: string) => { sql: SQL; type: FieldType }

const NUMERIC_TYPES: FieldType[] = ['number', 'currency']

const AGGREGATE_SQL: Record<AggregateFn, (arg: SQL) => SQL> = {
  sum: (arg) => sql`sum(${arg})`,
  avg: (arg) => sql`avg(${arg})`,
  count: (arg) => sql`count(${arg})`,
  count_distinct: (arg) => sql`count(DISTINCT ${arg})`,
  min: (arg) => sql`min(${arg})`,
  max: (arg) => sql`max(${arg})`,
}

/** SQL for a parsed expression. Division by zero yields NULL instead of an error. */
export function compileExpression(node: ExpressionNode, resolve: FieldResolver, numericOnly = true): SQL {
  switch (node.kind) {
    case 'number':
      return sql`${node.value}::numeric`
    case 'field': {
      const field = resolve(node.name)
      if (numericOnly && !NUMERIC_TYPES.includes(field.type)) throw invalid(`o campo "${node.name}" não é numérico`)
      return field.sql
    }
    case 'aggregate': {
      const countsAnything = node.fn === 'count' || node.fn === 'count_distinct'
      return AGGREGATE_SQL[node.fn](compileExpression(node.arg, resolve, !countsAnything))
    }
    case 'negate':
      return sql`(-${compileExpression(node.arg, resolve, numericOnly)})`
    case 'binary': {
      const left = compileExpression(node.left, resolve, numericOnly)
      const right = compileExpression(node.right, resolve, numericOnly)
      if (node.op === '/') return sql`(${left} / NULLIF(${right}, 0))`
      return sql`(${left} ${sql.raw(node.op)} ${right})`
    }
  }
}
