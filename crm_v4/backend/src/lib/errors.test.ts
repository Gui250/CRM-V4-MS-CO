import { describe, expect, it } from 'vitest'
import { conflict, DomainError, forbidden, notFound, unauthorized } from './errors.js'

describe('DomainError helpers', () => {
  it('builds errors with code and HTTP status', () => {
    expect(notFound()).toMatchObject({ code: 'NOT_FOUND', httpStatus: 404 })
    expect(forbidden()).toMatchObject({ code: 'FORBIDDEN', httpStatus: 403 })
    expect(unauthorized()).toMatchObject({ code: 'UNAUTHENTICATED', httpStatus: 401 })
    expect(conflict('EMAIL_TAKEN', 'x')).toMatchObject({ code: 'EMAIL_TAKEN', httpStatus: 409 })
  })

  it('is an Error instance with the given message', () => {
    const error = conflict('LAST_ADMIN', 'mensagem')
    expect(error).toBeInstanceOf(DomainError)
    expect(error).toBeInstanceOf(Error)
    expect(error.message).toBe('mensagem')
  })
})
