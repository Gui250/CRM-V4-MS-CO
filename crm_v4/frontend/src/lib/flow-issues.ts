import { ApiError, apiFetch } from './api'
import type { Flow, FlowGraph, GraphIssue } from './automation-types'

// Save and activate need the `issues` list of a 422 INVALID_FLOW, which apiFetch drops.

export type FlowResult = { ok: true; flow: Flow } | { ok: false; issues: GraphIssue[]; message: string }

async function send(path: string, method: string, body?: unknown): Promise<FlowResult> {
  const response = await fetch(path, {
    method,
    credentials: 'include',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data = (await response.json().catch(() => null)) as (Flow & { code?: string; message?: string; issues?: GraphIssue[] }) | null
  if (response.ok) return { ok: true, flow: data as Flow }
  if (data?.code === 'INVALID_FLOW') return { ok: false, issues: data.issues ?? [], message: data.message ?? 'O fluxo tem problemas.' }
  // Anything else goes through the shared error path (session redirect, pt-BR message).
  if (response.status === 401) return apiFetch<never>(path, { method })
  throw new ApiError(response.status, data?.code ?? 'UNKNOWN', data?.message ?? 'Algo deu errado. Tente novamente.')
}

export const saveFlowGraph = (flowId: string, graph: FlowGraph) => send(`/api/flows/${flowId}/graph`, 'PUT', graph)

export const activateFlow = (flowId: string) => send(`/api/flows/${flowId}/activate`, 'POST')

/** Issues keyed by node id; issues without a node go under '' for the toolbar. */
export function issuesByNode(issues: GraphIssue[]): Map<string, string[]> {
  const map = new Map<string, string[]>()
  for (const issue of issues) {
    const key = issue.nodeId ?? ''
    map.set(key, [...(map.get(key) ?? []), issue.message])
  }
  return map
}
