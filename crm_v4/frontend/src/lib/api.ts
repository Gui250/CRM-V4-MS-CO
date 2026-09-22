export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    /** Extra error data from the backend, e.g. who saved a report first on a 409. */
    readonly details?: unknown,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

type Init = Omit<RequestInit, 'body'> & { json?: unknown; body?: BodyInit }

function redirectToLogin() {
  if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
    // Runs outside React (any fetch can hit an expired session), so there is no router here.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign('/login')
  }
}

export async function apiFetch<T>(path: string, init: Init = {}): Promise<T> {
  const { json, headers, ...rest } = init
  const response = await fetch(path, {
    credentials: 'include',
    ...rest,
    headers: json === undefined ? headers : { 'Content-Type': 'application/json', ...headers },
    body: json === undefined ? rest.body : JSON.stringify(json),
  })

  if (response.status === 204) return undefined as T
  const data: unknown = await response.json().catch(() => null)
  if (response.ok) return data as T

  const { code = 'UNKNOWN', message = 'Algo deu errado. Tente novamente.', details } = (data ?? {}) as {
    code?: string
    message?: string
    details?: unknown
  }
  // Only an expired/missing session sends the user to login; wrong credentials must not.
  if (code === 'UNAUTHENTICATED') redirectToLogin()
  throw new ApiError(response.status, code, message, details)
}
