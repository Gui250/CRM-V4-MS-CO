'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError, apiFetch } from '@/lib/api'
import { biKeys } from '@/lib/bi/use-bi'
import type { FieldType, RefreshInterval, Relationship, Source, SourceField, SourceKind } from '@/lib/bi/types'

export type ExternalKind = Exclude<SourceKind, 'internal'>
export type Upload = { storagePath: string; originalFilename: string; sheets: string[] }
export type Preview = { fields: SourceField[]; rows: unknown[][]; totalRowsRead: number; sheets?: string[] }
export type SourceBody = {
  name: string
  kind: ExternalKind
  config: Record<string, unknown>
  secrets?: Record<string, unknown>
  refreshInterval?: RefreshInterval
  sourceId?: string
  fieldTypes?: Record<string, FieldType>
  fieldLabels?: Record<string, string>
}
export type SourcePatch = Partial<Omit<SourceBody, 'kind' | 'sourceId'>>
export type NewRelationship = Omit<Relationship, 'id'>

export const errorText = (error: unknown) => (error instanceof ApiError ? error.message : 'Algo deu errado. Tente novamente.')

const POLL_MS = 5_000

/** Same key as `useSources`, but polls while any source is capturing. */
export const useSourcesPolling = () =>
  useQuery({
    queryKey: biKeys.sources,
    queryFn: () => apiFetch<Source[]>('/api/bi/sources'),
    refetchInterval: (query) => (query.state.data?.some((source) => source.isRefreshing) ? POLL_MS : false),
  })

export const useSourcePolling = (id: string) =>
  useQuery({
    queryKey: biKeys.source(id),
    queryFn: () => apiFetch<Source>(`/api/bi/sources/${encodeURIComponent(id)}`),
    refetchInterval: (query) => (query.state.data?.isRefreshing ? POLL_MS : false),
  })

function useInvalidateSources() {
  const client = useQueryClient()
  return () => client.invalidateQueries({ queryKey: biKeys.sources })
}

export function useRefreshSource() {
  const invalidate = useInvalidateSources()
  return useMutation({
    mutationFn: (id: string) => apiFetch<null>(`/api/bi/sources/${encodeURIComponent(id)}/refresh`, { method: 'POST' }),
    onSettled: invalidate,
  })
}

export function useCreateSource() {
  const invalidate = useInvalidateSources()
  return useMutation({
    mutationFn: (body: SourceBody) => apiFetch<Source>('/api/bi/sources', { method: 'POST', json: body }),
    onSuccess: invalidate,
  })
}

export function useUpdateSource(id: string) {
  const invalidate = useInvalidateSources()
  return useMutation({
    mutationFn: (body: SourcePatch) => apiFetch<Source>(`/api/bi/sources/${encodeURIComponent(id)}`, { method: 'PATCH', json: body }),
    onSuccess: invalidate,
  })
}

export function useDeleteSource(id: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: () => apiFetch<null>(`/api/bi/sources/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    onSuccess: () => {
      client.removeQueries({ queryKey: biKeys.source(id) })
      void client.invalidateQueries({ queryKey: biKeys.sources })
      void client.invalidateQueries({ queryKey: biKeys.relationships })
    },
  })
}

export const usePreviewSource = () =>
  useMutation({ mutationFn: (body: SourceBody) => apiFetch<Preview>('/api/bi/sources/preview', { method: 'POST', json: body }) })

export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024

export const useUploadSpreadsheet = () =>
  useMutation({
    mutationFn: (file: File) => {
      if (file.size > MAX_UPLOAD_BYTES) throw new ApiError(413, 'FILE_TOO_LARGE', 'A planilha passa de 50 MB.')
      const form = new FormData()
      form.append('file', file)
      // ponytail: spinner instead of a progress bar; switch to XMLHttpRequest if uploads feel slow.
      return apiFetch<Upload>('/api/bi/uploads', { method: 'POST', body: form })
    },
  })

export function useCreateRelationship() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (body: NewRelationship) => apiFetch<Relationship>('/api/bi/relationships', { method: 'POST', json: body }),
    onSuccess: () => client.invalidateQueries({ queryKey: biKeys.relationships }),
  })
}

export function useDeleteRelationship() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiFetch<null>(`/api/bi/relationships/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    onSuccess: () => client.invalidateQueries({ queryKey: biKeys.relationships }),
  })
}
