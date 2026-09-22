const UNIQUE_VIOLATION = '23505'

/** Postgres unique_violation, as thrown by postgres-js (code) or wrapped by drizzle/PGlite (cause.code). */
export function isUniqueViolation(error: unknown): boolean {
  const code = (error as { code?: string })?.code
  const causeCode = (error as { cause?: { code?: string } })?.cause?.code
  return code === UNIQUE_VIOLATION || causeCode === UNIQUE_VIOLATION
}
