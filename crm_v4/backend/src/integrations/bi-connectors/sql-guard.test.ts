import { describe, expect, it } from 'vitest'
import { DomainError } from '../../lib/errors.js'
import { MAX_QUERY_LENGTH } from '../../models/bi/limits.js'
import { assertReadOnlyQuery, mapDatabaseError, sourceQuery, type DatabaseConfig } from './sql-guard.js'

describe('assertReadOnlyQuery', () => {
  it.each([
    'SELECT * FROM vendas',
    'select id from vendas',
    'WITH t AS (SELECT 1 AS n) SELECT n FROM t',
    '  -- comentário\n/* bloco */ SELECT 1',
    'SELECT 1;',
    "SELECT 'drop; delete' AS texto",
    'SELECT "update" FROM t',
    'SELECT updated_at, created_by FROM t',
    "SELECT $$it's$$",
    'SELECT `order` FROM t -- fim',
    "SELECT 'it''s'",
  ])('accepts %s', (query) => {
    expect(() => assertReadOnlyQuery(query)).not.toThrow()
  })

  it.each([
    'INSERT INTO t VALUES (1)',
    'UPDATE t SET a = 1',
    'DELETE FROM t',
    'DROP TABLE t',
    'ALTER TABLE t ADD c int',
    'TRUNCATE t',
    'GRANT ALL ON t TO x',
    'COPY t TO STDOUT',
    'CALL proc()',
    'SELECT * INTO novo FROM t',
    'WITH x AS (DELETE FROM t RETURNING *) SELECT * FROM x',
    'SELECT 1; SELECT 2',
    'SELECT 1; DROP TABLE t',
    'SELECT * FROM t FOR UPDATE',
    'EXPLAIN SELECT 1',
    '(SELECT 1)',
    '',
    // Postgres reads 'a\' as a complete string, so the DROP is real code there.
    "SELECT 'a\\' ; DROP TABLE t; --'",
    // MySQL reads 'a\'' as a complete string, so the DROP is real code there.
    "SELECT 'a\\'' ; DROP TABLE t",
    // In Postgres # is an operator, not a comment.
    'SELECT 1 # 2; DROP TABLE t',
    // In MySQL --1 is not a comment.
    'SELECT 1 --1; DROP TABLE t',
    // MySQL executes /*! … */ comments.
    'SELECT 1 /*! ; DROP TABLE t */',
  ])('rejects %s', (query) => {
    expect(() => assertReadOnlyQuery(query)).toThrow(
      expect.objectContaining({
        code: 'QUERY_NOT_READ_ONLY',
        httpStatus: 422,
        message: 'A consulta precisa ser uma única instrução SELECT, sem alterar dados.',
      }),
    )
  })

  it(`rejects queries longer than ${MAX_QUERY_LENGTH} characters`, () => {
    const query = `SELECT ${'1'.repeat(MAX_QUERY_LENGTH)}`

    expect(() => assertReadOnlyQuery(query)).toThrow(expect.objectContaining({ code: 'QUERY_NOT_READ_ONLY' }))
  })
})

const base: DatabaseConfig = { host: 'h', port: 5432, database: 'd', user: 'u', ssl: false, mode: 'table' }
const quote = (name: string) => `"${name}"`

describe('sourceQuery', () => {
  it('selects everything from a schema-qualified table', () => {
    expect(sourceQuery({ ...base, table: { schema: 'public', name: 'vendas' } }, quote)).toBe(
      'SELECT * FROM "public"."vendas"',
    )
  })

  it('selects from a bare table without schema', () => {
    expect(sourceQuery({ ...base, table: { name: 'vendas' } }, quote)).toBe('SELECT * FROM "vendas"')
  })

  it('returns a checked query in query mode', () => {
    expect(sourceQuery({ ...base, mode: 'query', query: 'SELECT 1' }, quote)).toBe('SELECT 1')
  })

  it('rejects a writing query in query mode', () => {
    expect(() => sourceQuery({ ...base, mode: 'query', query: 'DELETE FROM t' }, quote)).toThrow(
      expect.objectContaining({ code: 'QUERY_NOT_READ_ONLY' }),
    )
  })
})

describe('mapDatabaseError', () => {
  const codes = { AUTH: 'auth' } as const

  it('maps a driver code', () => {
    expect(mapDatabaseError(Object.assign(new Error('x'), { code: 'AUTH' }), codes)).toMatchObject({ code: 'AUTH_FAILED' })
  })

  it('maps network codes to CONNECTION_FAILED', () => {
    expect(mapDatabaseError(Object.assign(new Error('x'), { code: 'ECONNREFUSED' }), codes)).toMatchObject({
      code: 'CONNECTION_FAILED',
      message: 'Não foi possível conectar ao banco. Verifique endereço e porta.',
    })
  })

  it('keeps other database messages as QUERY_FAILED', () => {
    expect(mapDatabaseError(Object.assign(new Error('relation "x" does not exist'), { code: '42P01' }), codes)).toMatchObject({
      code: 'QUERY_FAILED',
      message: 'O banco recusou a consulta: relation "x" does not exist',
    })
  })

  it('passes DomainErrors through', () => {
    const error = new DomainError('TOO_MANY_ROWS', 'x', 422)

    expect(mapDatabaseError(error, codes)).toBe(error)
  })
})
