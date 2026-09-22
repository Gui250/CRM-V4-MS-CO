export class DomainError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly httpStatus: number,
    /** Extra fields for the response body, e.g. `issues` of an invalid flow. */
    readonly extra?: Record<string, unknown>,
  ) {
    super(message)
    this.name = 'DomainError'
  }
}

export const notFound = (message = 'Não encontrado.') => new DomainError('NOT_FOUND', message, 404)

export const forbidden = (message = 'Você não tem permissão para esta ação.', code = 'FORBIDDEN') =>
  new DomainError(code, message, 403)

export const unauthorized = (code = 'UNAUTHENTICATED', message = 'Faça login para continuar.') =>
  new DomainError(code, message, 401)

export const conflict = (code: string, message: string) => new DomainError(code, message, 409)
