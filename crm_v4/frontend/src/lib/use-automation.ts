'use client'

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from './api'
import type {
  AiAgent,
  AiAgentInput,
  AiProvider,
  AiVendor,
  Flow,
  FlowGraph,
  FlowSummary,
  RunDetail,
  RunStatus,
  RunSummary,
} from './automation-types'

export const automationKeys = {
  flows: (filters: Record<string, string> = {}) => ['flows', filters] as const,
  flow: (id: string) => ['flow', id] as const,
  flowRuns: (flowId: string, status?: RunStatus) => ['runs', flowId, status ?? 'all'] as const,
  run: (id: string) => ['run', id] as const,
  conversationRuns: (conversationId: string) => ['conversation-runs', conversationId] as const,
  providers: ['ai-providers'] as const,
  agents: ['ai-agents'] as const,
}

const json = (method: string, body?: unknown) => ({ method, json: body })

// ---------- Fluxos ----------

export function useFlows() {
  return useQuery({ queryKey: automationKeys.flows(), queryFn: () => apiFetch<FlowSummary[]>('/api/flows') })
}

/** Menu de disparo do chat: qualquer fluxo ativo (o único filtro permitido para atendentes). */
export function useStartableFlows() {
  const filters = { status: 'active' }
  return useQuery({
    queryKey: automationKeys.flows(filters),
    queryFn: () => apiFetch<FlowSummary[]>(`/api/flows?${new URLSearchParams(filters)}`),
  })
}

export function useFlow(id: string) {
  return useQuery({ queryKey: automationKeys.flow(id), queryFn: () => apiFetch<Flow>(`/api/flows/${id}`) })
}

function useFlowMutation<V>(request: (vars: V) => Promise<Flow | undefined>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: request,
    onSuccess: (flow) => {
      if (flow) queryClient.setQueryData(automationKeys.flow(flow.id), flow)
      return queryClient.invalidateQueries({ queryKey: ['flows'] })
    },
  })
}

export const useCreateFlow = () =>
  useFlowMutation((body: { name: string; description?: string | null }) => apiFetch<Flow>('/api/flows', json('POST', body)))

export const useUpdateFlow = () =>
  useFlowMutation(({ id, ...body }: { id: string; name?: string; description?: string | null; priority?: number }) =>
    apiFetch<Flow>(`/api/flows/${id}`, json('PATCH', body)),
  )

export const useSaveGraph = () =>
  useFlowMutation(({ id, graph }: { id: string; graph: FlowGraph }) => apiFetch<Flow>(`/api/flows/${id}/graph`, json('PUT', graph)))

export const useActivateFlow = () => useFlowMutation((id: string) => apiFetch<Flow>(`/api/flows/${id}/activate`, json('POST')))

export const useDeactivateFlow = () => useFlowMutation((id: string) => apiFetch<Flow>(`/api/flows/${id}/deactivate`, json('POST')))

export const useDuplicateFlow = () => useFlowMutation((id: string) => apiFetch<Flow>(`/api/flows/${id}/duplicate`, json('POST')))

export const useDeleteFlow = () => useFlowMutation((id: string) => apiFetch<undefined>(`/api/flows/${id}`, { method: 'DELETE' }))

export interface UploadedAsset {
  mediaPath: string
  mime: string
  filename: string
  size: number
}

export function useUploadFlowAsset() {
  return useMutation({
    mutationFn: (file: File) => {
      const form = new FormData()
      form.append('file', file)
      return apiFetch<UploadedAsset>('/api/flow-assets', { method: 'POST', body: form })
    },
  })
}

export const flowAssetUrl = (mediaPath: string) => `/api/flow-assets/${mediaPath.split('/').map(encodeURIComponent).join('/')}`

// ---------- Execuções ----------

export function useFlowRuns(flowId: string, status?: RunStatus) {
  return useInfiniteQuery({
    queryKey: automationKeys.flowRuns(flowId, status),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams()
      if (status) params.set('status', status)
      if (pageParam) params.set('cursor', pageParam)
      return apiFetch<{ items: RunSummary[]; nextCursor: string | null }>(`/api/flows/${flowId}/runs?${params}`)
    },
    getNextPageParam: (page) => page.nextCursor,
  })
}

export function useRun(id: string | null) {
  return useQuery({
    queryKey: automationKeys.run(id ?? ''),
    queryFn: () => apiFetch<RunDetail>(`/api/runs/${id}`),
    enabled: id !== null,
  })
}

export function useConversationRuns(conversationId: string) {
  return useQuery({
    queryKey: automationKeys.conversationRuns(conversationId),
    queryFn: () => apiFetch<RunSummary[]>(`/api/conversations/${conversationId}/runs`),
  })
}

function useRunMutation<V>(request: (vars: V) => Promise<RunSummary>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: request,
    onSuccess: (run) => queryClient.invalidateQueries({ queryKey: automationKeys.conversationRuns(run.conversationId) }),
  })
}

export const useStartFlow = () =>
  useRunMutation(({ conversationId, flowId }: { conversationId: string; flowId: string }) =>
    apiFetch<RunSummary>(`/api/conversations/${conversationId}/start-flow`, json('POST', { flowId })),
  )

export function useStartFlowForPhone() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: { phone: string; flowId: string }) =>
      apiFetch<{ conversation: { id: string }; run: RunSummary }>('/api/conversations/start-flow', json('POST', body)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['conversations'] }),
  })
}

export const useCancelRun = () => useRunMutation((runId: string) => apiFetch<RunSummary>(`/api/runs/${runId}/cancel`, json('POST')))

export const useTestFlow = () =>
  useRunMutation(({ flowId, graph, phone }: { flowId: string; graph: FlowGraph; phone: string }) =>
    apiFetch<RunSummary>(`/api/flows/${flowId}/test`, json('POST', { graph, phone })),
  )

// ---------- Provedores e agentes ----------

export function useAiProviders() {
  return useQuery({ queryKey: automationKeys.providers, queryFn: () => apiFetch<AiProvider[]>('/api/ai-providers') })
}

function useProviderMutation<V>(request: (vars: V) => Promise<unknown>) {
  const queryClient = useQueryClient()
  return useMutation({ mutationFn: request, onSuccess: () => queryClient.invalidateQueries({ queryKey: automationKeys.providers }) })
}

export const useCreateAiProvider = () =>
  useProviderMutation((body: { name: string; vendor: AiVendor; apiKey: string }) =>
    apiFetch<AiProvider>('/api/ai-providers', json('POST', body)),
  )

export const useUpdateAiProvider = () =>
  useProviderMutation(({ id, ...body }: { id: string; name?: string; apiKey?: string }) =>
    apiFetch<AiProvider>(`/api/ai-providers/${id}`, json('PATCH', body)),
  )

export const useRetestAiProvider = () =>
  useProviderMutation((id: string) => apiFetch<AiProvider>(`/api/ai-providers/${id}/test`, json('POST')))

export const useDeleteAiProvider = () =>
  useProviderMutation((id: string) => apiFetch<undefined>(`/api/ai-providers/${id}`, { method: 'DELETE' }))

export function useAiAgents() {
  return useQuery({ queryKey: automationKeys.agents, queryFn: () => apiFetch<AiAgent[]>('/api/ai-agents') })
}

function useAgentMutation<V>(request: (vars: V) => Promise<unknown>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: request,
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: automationKeys.agents }),
        queryClient.invalidateQueries({ queryKey: automationKeys.providers }),
      ]),
  })
}

export const useCreateAiAgent = () =>
  useAgentMutation((body: AiAgentInput) => apiFetch<AiAgent>('/api/ai-agents', json('POST', body)))

export const useUpdateAiAgent = () =>
  useAgentMutation(({ id, ...body }: Partial<AiAgentInput> & { id: string; isActive?: boolean }) =>
    apiFetch<AiAgent>(`/api/ai-agents/${id}`, json('PATCH', body)),
  )

export const useDeleteAiAgent = () => useAgentMutation((id: string) => apiFetch<undefined>(`/api/ai-agents/${id}`, { method: 'DELETE' }))
