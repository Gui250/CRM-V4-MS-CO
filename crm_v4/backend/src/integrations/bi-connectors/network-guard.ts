import { promises as dns } from 'node:dns'
import { BlockList, isIP } from 'node:net'
import { DomainError } from '../../lib/errors.js'

export type Lookup = (hostname: string, options: { all: true }) => Promise<{ address: string; family: number }[]>

export interface GuardOptions {
  /** BI_ALLOW_PRIVATE_NETWORKS: true in dev so the docker compose Postgres can be a source. */
  allowPrivate: boolean
  lookup?: Lookup
}

export interface FetchGuardOptions extends GuardOptions {
  fetch?: typeof fetch
}

const MAX_REDIRECTS = 5
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])

// Private, loopback, link-local (cloud metadata at 169.254.169.254) and unspecified ranges.
// BlockList also matches IPv4-mapped IPv6 (::ffff:10.0.0.1) against the IPv4 rules.
const blocked = new BlockList()
for (const [net, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.168.0.0', 16],
] as const) {
  blocked.addSubnet(net, prefix, 'ipv4')
}
blocked.addAddress('::', 'ipv6')
blocked.addAddress('::1', 'ipv6')
blocked.addSubnet('fc00::', 7, 'ipv6')
blocked.addSubnet('fe80::', 10, 'ipv6')

const hostNotAllowed = () =>
  new DomainError('HOST_NOT_ALLOWED', 'Endereço não permitido: aponta para uma rede interna.', 422)

async function resolve(host: string, lookup: Lookup): Promise<{ address: string; family: number }[]> {
  const family = isIP(host)
  if (family !== 0) return [{ address: host, family }]
  try {
    return await lookup(host, { all: true })
  } catch {
    throw new DomainError('CONNECTION_FAILED', `Não foi possível encontrar o endereço "${host}".`, 422)
  }
}

// ponytail: there is a window between this lookup and the driver's own connect (DNS rebinding).
// Accepted because only admins configure sources; close it with an agent that pins the resolved IP.
export async function assertHostAllowed(host: string, opts: GuardOptions): Promise<void> {
  if (opts.allowPrivate) return
  const bare = host.replace(/^\[(.*)\]$/, '$1') // URL.hostname keeps the brackets of IPv6 literals
  const addresses = await resolve(bare, opts.lookup ?? dns.lookup)
  const isBlocked = ({ address, family }: { address: string; family: number }) =>
    blocked.check(address, family === 6 ? 'ipv6' : 'ipv4')
  if (addresses.some(isBlocked)) throw hostNotAllowed()
}

function parseHttpUrl(url: string | URL, base?: URL): URL {
  let parsed: URL
  try {
    parsed = new URL(url, base)
  } catch {
    throw new DomainError('VALIDATION_ERROR', 'Endereço inválido.', 422)
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new DomainError('VALIDATION_ERROR', 'Use um endereço http:// ou https://.', 422)
  }
  return parsed
}

/** The request the next hop makes, following what `fetch` itself would do. */
function nextInit(init: RequestInit, status: number, from: URL, to: URL): RequestInit {
  const next = status === 303 || ((status === 301 || status === 302) && init.method === 'POST')
    ? { ...init, method: 'GET', body: undefined }
    : init
  // Headers may carry secrets (Authorization, API keys); never forward them to another origin.
  return from.origin === to.origin ? next : { ...next, headers: undefined }
}

/** fetch that refuses internal hosts and re-checks every redirect hop. */
export async function guardedFetch(url: string, init: RequestInit, opts: FetchGuardOptions): Promise<Response> {
  const doFetch = opts.fetch ?? fetch
  let current = parseHttpUrl(url)
  let currentInit = init
  for (let hop = 0; ; hop++) {
    await assertHostAllowed(current.hostname, opts)
    const response = await doFetch(current, { ...currentInit, redirect: 'manual' })
    const location = response.headers.get('location')
    if (!REDIRECT_STATUSES.has(response.status) || !location) return response
    await response.body?.cancel()
    if (hop === MAX_REDIRECTS) {
      throw new DomainError('CONNECTION_FAILED', 'Redirecionamentos demais: o endereço redireciona mais de 5 vezes.', 422)
    }
    const next = parseHttpUrl(location, current)
    currentInit = nextInit(currentInit, response.status, current, next)
    current = next
  }
}
