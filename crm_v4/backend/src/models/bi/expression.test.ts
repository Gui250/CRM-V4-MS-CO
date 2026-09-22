import { sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { createTestDb } from '../../test/db.js'
import type { FieldType } from './definition.js'
import { compileExpression, parseExpression, type FieldResolver } from './expression.js'
import { executeRows } from './sql.js'

const fields: Record<string, { sql: ReturnType<typeof sql>; type: FieldType }> = {
  Valor: { sql: sql`t.valor`, type: 'currency' },
  Custo: { sql: sql`t.custo`, type: 'number' },
  Lead: { sql: sql`t.lead`, type: 'text' },
}
const resolve: FieldResolver = (name) => {
  const field = fields[name]
  if (!field) throw new Error(`unknown ${name}`)
  return field
}

async function evaluate(expression: string): Promise<number | null> {
  const db = await createTestDb()
  const parsed = parseExpression(expression)
  const [row] = await executeRows<{ r: number | null }>(
    db,
    sql`SELECT (${compileExpression(parsed.ast, resolve)})::float8 AS r
        FROM (VALUES (10::numeric, 4::numeric, 'a'), (20, 0, 'b'), (30, 6, 'a')) AS t(valor, custo, lead)
        ${parsed.isAggregate ? sql`` : sql`LIMIT 1`}`,
  )
  return row!.r
}

describe('parseExpression', () => {
  it('parses arithmetic with precedence and parentheses', async () => {
    expect(await evaluate('[Valor] * 2 + 1')).toBe(21)
    expect(await evaluate('([Valor] + [Custo]) * 2')).toBe(28)
    expect(await evaluate('-[Valor] + 3,5')).toBe(-6.5)
  })

  it('marks expressions with aggregates and lists referenced fields', () => {
    const parsed = parseExpression('SUM([Valor]) / COUNT([Lead])')
    expect(parsed.isAggregate).toBe(true)
    expect(parsed.fieldNames).toEqual(['Valor', 'Lead'])
    expect(parseExpression('[Valor] - [Custo]').isAggregate).toBe(false)
  })

  it('computes a ratio between aggregates', async () => {
    expect(await evaluate('SUM([Valor]) / COUNT([Lead])')).toBe(20)
    expect(await evaluate('count_distinct([Lead])')).toBe(2)
  })

  it('turns division by zero into null', async () => {
    const db = await createTestDb()
    const parsed = parseExpression('[Valor] / [Custo]')
    const rows = await executeRows<{ r: number | null }>(
      db,
      sql`SELECT (${compileExpression(parsed.ast, resolve)})::float8 AS r FROM (VALUES (20::numeric, 0::numeric)) AS t(valor, custo)`,
    )
    expect(rows[0]!.r).toBeNull()
  })

  it.each([
    ['[Valor] +', 'terminou antes do esperado'],
    ['([Valor] + 1', 'esperava ")"'],
    ['FOO([Valor])', 'função desconhecida "FOO"'],
    ['[Valor] + SUM([Custo])', 'dentro de uma agregação'],
    ['SUM(SUM([Valor]))', 'agregação dentro de outra'],
    ['[Valor] ; 1', 'caractere inesperado'],
    ['', 'vazia'],
    ['1'.repeat(501), 'no máximo 500'],
  ])('rejects %s', (expression, message) => {
    expect(() => parseExpression(expression)).toThrow(expect.objectContaining({ code: 'INVALID_EXPRESSION', httpStatus: 422, message: expect.stringContaining(message) }))
  })

  it('reports the position of the problem', () => {
    expect(() => parseExpression('[Valor] $')).toThrow(/posição 9/)
  })

  it('rejects arithmetic on text fields but allows counting them', () => {
    expect(() => compileExpression(parseExpression('[Lead] * 2').ast, resolve)).toThrow(/não é numérico/)
    expect(() => compileExpression(parseExpression('COUNT([Lead])').ast, resolve)).not.toThrow()
  })

  it('treats bracketed names as data handed to the resolver, never as SQL', () => {
    const parsed = parseExpression("[x'); DROP TABLE users; --] * 2")
    expect(parsed.fieldNames).toEqual(["x'); DROP TABLE users; --"])
  })
})
