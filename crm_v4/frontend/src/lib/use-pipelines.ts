'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { apiFetch } from './api'
import {
  applyLeadUpsert,
  boardKey,
  contactLeadsKey,
  deleteLeadEverywhere,
  estimatePosition,
  upsertLeadEverywhere,
  type BoardFilter,
} from './pipeline-cache'
import type { Board, Lead, LeadDetail, Page, Pipeline, Stage, UserRef } from './types'

export const pipelinesKey = (includeArchived: boolean) => ['pipelines', { includeArchived }] as const

export function usePipelines(includeArchived = false) {
  return useQuery({
    queryKey: pipelinesKey(includeArchived),
    queryFn: () => apiFetch<Pipeline[]>(`/api/pipelines${includeArchived ? '?includeArchived=true' : ''}`),
  })
}

export function useAssignableUsers() {
  return useQuery({ queryKey: ['users', 'assignable'], queryFn: () => apiFetch<UserRef[]>('/api/users/assignable') })
}

function filterParams(filter: BoardFilter) {
  const params = new URLSearchParams()
  if (filter.assignee) params.set('assignee', filter.assignee)
  if (filter.search.trim()) params.set('search', filter.search.trim())
  return params
}

export function useBoard(pipelineId: string, filter: BoardFilter) {
  return useQuery({
    queryKey: boardKey(pipelineId, filter),
    queryFn: () => {
      const query = filterParams(filter).toString()
      return apiFetch<Board>(`/api/pipelines/${pipelineId}/board${query ? `?${query}` : ''}`)
    },
  })
}

/** Appends the next page of one column into the board cache. */
export function useLoadMoreLeads(pipelineId: string, filter: BoardFilter) {
  const client = useQueryClient()
  return useCallback(
    async (stageId: string, cursor: string) => {
      const params = filterParams(filter)
      params.set('cursor', cursor)
      const page = await apiFetch<Page<Lead>>(`/api/pipelines/${pipelineId}/stages/${stageId}/leads?${params}`)
      client.setQueryData<Board>(boardKey(pipelineId, filter), (board) =>
        board
          ? {
              ...board,
              stages: board.stages.map((stage) =>
                stage.id === stageId
                  ? {
                      ...stage,
                      leads: [...stage.leads, ...page.items.filter((l) => !stage.leads.some((c) => c.id === l.id))],
                      nextCursor: page.nextCursor,
                    }
                  : stage,
              ),
            }
          : board,
      )
    },
    [client, pipelineId, filter],
  )
}

export type MoveInput = { lead: Lead; stageId: string; beforeLeadId: string | null; lostReason?: string }

/** Moves optimistically on the given board (if any); rolls back when the server refuses. */
export function useMoveLead(board?: { pipelineId: string; filter: BoardFilter }) {
  const client = useQueryClient()
  const key = board ? boardKey(board.pipelineId, board.filter) : null
  return useMutation({
    mutationFn: ({ lead, stageId, beforeLeadId, lostReason }: MoveInput) =>
      apiFetch<Lead>(`/api/leads/${lead.id}/move`, { method: 'POST', json: { stageId, beforeLeadId, lostReason } }),
    onMutate: async ({ lead, stageId, beforeLeadId }) => {
      if (!key || !board) return { snapshot: undefined }
      await client.cancelQueries({ queryKey: key })
      const snapshot = client.getQueryData<Board>(key)
      if (snapshot) {
        const column = snapshot.stages.find((s) => s.id === stageId)?.leads.filter((l) => l.id !== lead.id) ?? []
        const optimistic = { ...lead, stageId, position: estimatePosition(column, beforeLeadId) }
        const previous = { stageId: lead.stageId, valueCents: lead.valueCents }
        client.setQueryData<Board>(key, applyLeadUpsert(snapshot, optimistic, previous, board.filter))
      }
      return { snapshot }
    },
    onError: (_error, _input, context) => {
      if (key && context?.snapshot) client.setQueryData(key, context.snapshot)
    },
    onSuccess: (lead, input) => {
      upsertLeadEverywhere(client, lead, { stageId: input.lead.stageId, valueCents: input.lead.valueCents })
    },
  })
}

export function useContactLeads(contactId: string) {
  return useQuery({
    queryKey: contactLeadsKey(contactId),
    queryFn: () => apiFetch<Lead[]>(`/api/leads?contactId=${contactId}`),
  })
}

export function useCreateLead() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (input: { pipelineId: string; contactId: string; stageId?: string }) =>
      apiFetch<Lead>('/api/leads', { method: 'POST', json: input }),
    onSuccess: (lead) => upsertLeadEverywhere(client, lead, null),
  })
}

// --- Structure (admins). The server also broadcasts pipeline.changed; invalidating here keeps the
// admin's own screen right even if the SSE stream is momentarily down.

function useStructureMutation<TInput, TResult>(request: (input: TInput) => Promise<TResult>, pipelineIdOf: (input: TInput, result: TResult) => string | undefined) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: request,
    onSuccess: (result, input) => {
      void client.invalidateQueries({ queryKey: ['pipelines'] })
      const pipelineId = pipelineIdOf(input, result)
      if (pipelineId) void client.invalidateQueries({ queryKey: ['board', pipelineId] })
    },
  })
}

export const useCreatePipeline = () =>
  useStructureMutation(
    (name: string) => apiFetch<Pipeline>('/api/pipelines', { method: 'POST', json: { name } }),
    (_input, pipeline) => pipeline.id,
  )

export const useUpdatePipeline = () =>
  useStructureMutation(
    ({ pipelineId, ...changes }: { pipelineId: string; name?: string; isEntry?: boolean; archived?: boolean }) =>
      apiFetch<Pipeline>(`/api/pipelines/${pipelineId}`, { method: 'PATCH', json: changes }),
    (input) => input.pipelineId,
  )

type StageFields = { name?: string; color?: Stage['color']; kind?: Stage['kind'] }

export const useCreateStage = () =>
  useStructureMutation(
    ({ pipelineId, ...fields }: { pipelineId: string; name: string } & StageFields) =>
      apiFetch<Stage>(`/api/pipelines/${pipelineId}/stages`, { method: 'POST', json: fields }),
    (input) => input.pipelineId,
  )

export const useUpdateStage = () =>
  useStructureMutation(
    ({ pipelineId, stageId, ...fields }: { pipelineId: string; stageId: string } & StageFields) =>
      apiFetch<Stage>(`/api/pipelines/${pipelineId}/stages/${stageId}`, { method: 'PATCH', json: fields }),
    (input) => input.pipelineId,
  )

export const useReorderStages = () =>
  useStructureMutation(
    ({ pipelineId, stageIds }: { pipelineId: string; stageIds: string[] }) =>
      apiFetch<Stage[]>(`/api/pipelines/${pipelineId}/stages/order`, { method: 'PUT', json: { stageIds } }),
    (input) => input.pipelineId,
  )

export const useDeleteStage = () =>
  useStructureMutation(
    ({ pipelineId, stageId, moveToStageId }: { pipelineId: string; stageId: string; moveToStageId?: string }) =>
      apiFetch(`/api/pipelines/${pipelineId}/stages/${stageId}${moveToStageId ? `?moveToStageId=${moveToStageId}` : ''}`, {
        method: 'DELETE',
      }),
    (input) => input.pipelineId,
  )

// --- Lead details (US4)

export const leadKey = (leadId: string) => ['lead', leadId] as const

export function useLead(leadId: string | null) {
  return useQuery({
    queryKey: leadKey(leadId ?? ''),
    queryFn: () => apiFetch<LeadDetail>(`/api/leads/${leadId}`),
    enabled: Boolean(leadId),
  })
}

export type LeadChanges = Partial<{ title: string | null; valueCents: number | null; assigneeId: string | null; notes: string | null }>

export function useUpdateLead(leadId: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (changes: LeadChanges) => apiFetch<Lead>(`/api/leads/${leadId}`, { method: 'PATCH', json: changes }),
    onSuccess: (lead) => {
      const before = client.getQueryData<LeadDetail>(leadKey(leadId))
      upsertLeadEverywhere(client, lead, before ? { stageId: before.stageId, valueCents: before.valueCents } : null)
      void client.invalidateQueries({ queryKey: leadKey(leadId) })
    },
  })
}

export function useDeleteLead(lead: Pick<Lead, 'id' | 'pipelineId' | 'stageId' | 'valueCents'> & { contactId: string }) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: () => apiFetch(`/api/leads/${lead.id}`, { method: 'DELETE' }),
    onSuccess: () => deleteLeadEverywhere(client, { leadId: lead.id, pipelineId: lead.pipelineId, stageId: lead.stageId, valueCents: lead.valueCents, contactId: lead.contactId }),
  })
}
