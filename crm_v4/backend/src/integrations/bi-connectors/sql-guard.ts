import { DomainError } from '../../lib/errors.js'
import { MAX_QUERY_LENGTH } from '../../models/bi/limits.js'

export interface DatabaseConfig {
  host: string
  port: number
  database: string
  user: string
  ssl: boolean
  mode: 'table' | 'query'
  table?: { schema?: string; name: string }
  query?: string
}

export const notReadOnly = () =>
  new DomainError('QUERY_NOT_READ_ONLY', 'A consulta precisa ser uma única instrução SELECT, sem alterar dados.', 422)

// Postgres: `--` always starts a comment, `#` is an operator, a backslash is a plain character
// inside quotes (standard_conforming_strings) and $tag$…$tag$ quotes text.
const PG_TOKENS = [
  String.raw`--[^\n]*`,
  String.raw`\/\*[\s\S]*?\*\/`,
  String.raw`\$([A-Za-z_]\w*)?\$[\s\S]*?\$\1\$`,
  String.raw`'(?:[^']|'')*'`,
  String.raw`"(?:[^"]|"")*"`,
]
// MySQL: `-- ` needs a space after it, `#` starts a comment, `/*! … */` is executed (so it is not
// stripped) and a backslash escapes inside quotes.
const MYSQL_TOKENS = [
  String.raw`--(?=[ \t\r\n]|$)[^\n]*`,
  String.raw`#[^\n]*`,
  String.raw`\/\*(?!!)[\s\S]*?\*\/`,
  String.raw`'(?:[^'\\]|\\[\s\S]|'')*'`,
  String.raw`"(?:[^"\\]|\\[\s\S]|"")*"`,
  '`(?:[^`]|``)*`',
]

// The query must pass under both dialects' rules, so text one dialect runs as code can never
// hide inside what the other reads as a comment or string.
const STRIPPERS = [PG_TOKENS, MYSQL_TOKENS].map((tokens) => new RegExp(tokens.join('|'), 'g'))

const WRITE_KEYWORDS =
  /\b(insert|update|delete|merge|drop|alter|truncate|grant|revoke|create|copy|call|do|lock|vacuum|into)\b/i
const READ_START = /^(select|with)\b/i
const TRAILING_SEMICOLON = /;\s*$/

function isReadOnly(code: string): boolean {
  const statement = code.trim().replace(TRAILING_SEMICOLON, '')
  return READ_START.test(statement) && !statement.includes(';') && !WRITE_KEYWORDS.test(statement)
}

/**
 * First of three read-only layers (research §5): one SELECT/WITH statement, no writing keywords.
 * The read-only transaction in the database is what actually guarantees it.
 */
export function assertReadOnlyQuery(query: string): void {
  if (query.length > MAX_QUERY_LENGTH) throw notReadOnly()
  if (!STRIPPERS.every((stripper) => isReadOnly(query.replace(stripper, ' ')))) throw notReadOnly()
}

/** The SQL a source runs: the checked query, or `SELECT *` over the chosen table. */
export function sourceQuery(config: DatabaseConfig, quoteIdentifier: (name: string) => string): string {
  if (config.mode === 'query') {
    assertReadOnlyQuery(config.query ?? '')
    return config.query!
  }
  if (!config.table) throw new DomainError('VALIDATION_ERROR', 'Escolha uma tabela.', 422)
  const { schema, name } = config.table
  const target = schema ? `${quoteIdentifier(schema)}.${quoteIdentifier(name)}` : quoteIdentifier(name)
  return `SELECT * FROM ${target}`
}

type ErrorKind = 'auth' | 'connection' | 'timeout' | 'readOnly'

const KIND_ERRORS: Record<ErrorKind, () => DomainError> = {
  auth: () => new DomainError('AUTH_FAILED', 'Usuário ou senha do banco incorretos.', 422),
  connection: () =>
    new DomainError('CONNECTION_FAILED', 'Não foi possível conectar ao banco. Verifique endereço e porta.', 422),
  timeout: () => new DomainError('TIMEOUT', 'A consulta passou de 30 segundos.', 422),
  readOnly: notReadOnly,
}

const NETWORK_CODES: Record<string, ErrorKind> = {
  ECONNREFUSED: 'connection',
  ENOTFOUND: 'connection',
  ETIMEDOUT: 'connection',
  EHOSTUNREACH: 'connection',
  ECONNRESET: 'connection',
}

/** Driver error → DomainError. Other database errors (syntax, missing table) keep their text. */
export function mapDatabaseError(error: unknown, driverCodes: Record<string, ErrorKind>): unknown {
  if (error instanceof DomainError || !(error instanceof Error)) return error
  const code = String((error as { code?: unknown }).code ?? '')
  const kind = driverCodes[code] ?? NETWORK_CODES[code]
  if (kind) return KIND_ERRORS[kind]()
  if (code) return new DomainError('QUERY_FAILED', `O banco recusou a consulta: ${error.message}`, 422)
  return error
}
