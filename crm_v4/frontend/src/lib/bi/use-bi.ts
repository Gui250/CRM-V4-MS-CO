'use client'

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError, apiFetch } from '../api'
import type { QueryRequest, QueryResult, Relationship, Report, ReportDefinition, ReportPage, ReportSummary, Source } from './types'

export const biKeys = {
  sources: ['bi-sources'] as const,
  source: (id: string) => ['bi-sources', id] as const,
  relationships: ['bi-relationships'] as const,
  query: (request: QueryRequest | null) => ['bi-query', request] as const,
  reports: ['bi-reports'] as const,
  report: (id: string) => ['bi-reports', id] as const,
}

export const useSources = () => useQuery({ queryKey: biKeys.sources, queryFn: () => apiFetch<Source[]>('/api/bi/sources') })

export const useSource = (id: string | null) =>
  useQuery({ queryKey: biKeys.source(id ?? ''), queryFn: () => apiFetch<Source>(`/api/bi/sources/${encodeURIComponent(id!)}`), enabled: !!id })

export const useRelationships = () =>
  useQuery({ queryKey: biKeys.relationships, queryFn: () => apiFetch<Relationship[]>('/api/bi/relationships') })

/** Runs a visual's query; keeps the previous result on screen while filters change. */
export const useVisualQuery = (request: QueryRequest | null) =>
  useQuery({
    queryKey: biKeys.query(request),
    queryFn: () => apiFetch<QueryResult>('/api/bi/query', { method: 'POST', json: request }),
    enabled: request !== null,
    placeholderData: keepPreviousData,
  })

export const useReports = () => useQuery({ queryKey: biKeys.reports, queryFn: () => apiFetch<ReportSummary[]>('/api/bi/reports') })

export const useReport = (id: string) => useQuery({ queryKey: biKeys.report(id), queryFn: () => apiFetch<Report>(`/api/bi/reports/${id}`) })

/** Someone else saved first (409). The UI offers reload or overwrite (`force: true`). */
export const isReportConflict = (error: unknown) => error instanceof ApiError && error.code === 'REPORT_CONFLICT'

export type SaveReportInput = { id: string; name: string; definition: ReportDefinition; version: number; force?: boolean }

export function useSaveReport() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: SaveReportInput) => apiFetch<Report>(`/api/bi/reports/${id}`, { method: 'PUT', json: body }),
    onSuccess: (report) => {
      client.setQueryData(biKeys.report(report.id), report)
      void client.invalidateQueries({ queryKey: biKeys.reports, exact: true })
    },
  })
}

export type CreateReportInput = { name: string; templateId?: 'whatsapp_attendance'; duplicateOf?: string }

export function useCreateReport() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateReportInput) => apiFetch<Report>('/api/bi/reports', { method: 'POST', json: body }),
    onSuccess: (report) => {
      client.setQueryData(biKeys.report(report.id), report)
      void client.invalidateQueries({ queryKey: biKeys.reports, exact: true })
    },
  })
}

export function useDeleteReport() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiFetch<null>(`/api/bi/reports/${id}`, { method: 'DELETE' }),
    onSuccess: (_, id) => {
      client.removeQueries({ queryKey: biKeys.report(id) })
      void client.invalidateQueries({ queryKey: biKeys.reports, exact: true })
    },
  })
}

/** "Gerar relatório sugerido": a ready page for the source (feed it to the editor's `replacePage`). */
export const useSuggestPage = () =>
  useMutation({ mutationFn: (sourceId: string) => apiFetch<ReportPage>('/api/bi/suggest', { method: 'POST', json: { sourceId } }) })
