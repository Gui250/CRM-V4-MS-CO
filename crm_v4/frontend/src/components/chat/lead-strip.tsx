'use client'

import { useState } from 'react'
import { LostReasonDialog } from '@/components/pipeline/lost-reason-dialog'
import { leadLabel } from '@/components/pipeline/lead-card'
import { STAGE_COLOR_CLASSES } from '@/components/pipeline/stage-colors'
import { ApiError } from '@/lib/api'
import type { Lead, Pipeline } from '@/lib/types'
import { useContactLeads, useCreateLead, useMoveLead, usePipelines } from '@/lib/use-pipelines'

const errorMessage = (error: unknown) => (error instanceof ApiError ? error.message : 'Algo deu errado. Tente novamente.')

function LeadRow({ lead, pipeline }: { lead: Lead; pipeline: Pipeline }) {
  const moveLead = useMoveLead()
  const [pendingLostStage, setPendingLostStage] = useState<string | null>(null)
  const stage = pipeline.stages.find((s) => s.id === lead.stageId)

  function changeStage(stageId: string) {
    const target = pipeline.stages.find((s) => s.id === stageId)
    if (target?.kind === 'lost') setPendingLostStage(stageId)
    else moveLead.mutate({ lead, stageId, beforeLeadId: null })
  }

  return (
    <li className="flex items-center gap-2">
      <span aria-hidden className={`size-2 shrink-0 ${stage ? STAGE_COLOR_CLASSES[stage.color].chip : 'bg-muted'}`} />
      <span className="font-semibold">{pipeline.name}</span>
      <label className="sr-only" htmlFor={`lead-stage-${lead.id}`}>
        Etapa em {pipeline.name}
      </label>
      <select
        id={`lead-stage-${lead.id}`}
        value={lead.stageId}
        onChange={(e) => changeStage(e.target.value)}
        className="bg-mist px-1.5 py-0.5 font-semibold outline-none hover:bg-line"
      >
        {pipeline.stages.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      <span className="truncate text-muted">{lead.assignee?.name ?? 'Sem responsável'}</span>
      {moveLead.isError && (
        <span role="alert" className="text-brand">
          {errorMessage(moveLead.error)}
        </span>
      )}
      {pendingLostStage && (
        <LostReasonDialog
          leadName={leadLabel(lead)}
          stageName={pipeline.stages.find((s) => s.id === pendingLostStage)?.name ?? ''}
          onCancel={() => setPendingLostStage(null)}
          onConfirm={(lostReason) => {
            moveLead.mutate({ lead, stageId: pendingLostStage, beforeLeadId: null, lostReason })
            setPendingLostStage(null)
          }}
        />
      )}
    </li>
  )
}

function CreateLeadForm({ contactId, pipelines, onDone }: { contactId: string; pipelines: Pipeline[]; onDone: () => void }) {
  const createLead = useCreateLead()
  const [pipelineId, setPipelineId] = useState(pipelines[0]?.id ?? '')
  const pipeline = pipelines.find((p) => p.id === pipelineId)
  const [stageId, setStageId] = useState('')

  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        createLead.mutate({ pipelineId, contactId, ...(stageId ? { stageId } : {}) }, { onSuccess: onDone })
      }}
    >
      <label className="sr-only" htmlFor={`new-lead-pipeline-${contactId}`}>
        Funil
      </label>
      <select
        id={`new-lead-pipeline-${contactId}`}
        value={pipelineId}
        onChange={(e) => {
          setPipelineId(e.target.value)
          setStageId('')
        }}
        className="bg-mist px-1.5 py-0.5 outline-none"
      >
        {pipelines.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <label className="sr-only" htmlFor={`new-lead-stage-${contactId}`}>
        Etapa
      </label>
      <select
        id={`new-lead-stage-${contactId}`}
        value={stageId}
        onChange={(e) => setStageId(e.target.value)}
        className="bg-mist px-1.5 py-0.5 outline-none"
      >
        <option value="">Primeira etapa</option>
        {pipeline?.stages.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      <button type="submit" disabled={createLead.isPending} className="bg-brand px-2 py-0.5 font-semibold text-white hover:bg-brand-dark">
        Criar
      </button>
      <button type="button" onClick={onDone} className="px-1 font-semibold text-muted hover:text-ink">
        Cancelar
      </button>
      {createLead.isError && (
        <span role="alert" className="text-brand">
          {errorMessage(createLead.error)}
        </span>
      )}
    </form>
  )
}

/** The contact's pipeline stages under the conversation header (US2). */
export function LeadStrip({ contactId }: { contactId: string }) {
  const { data: leads } = useContactLeads(contactId)
  const { data: pipelines } = usePipelines()
  const [creating, setCreating] = useState(false)
  if (!leads || !pipelines) return null

  const available = pipelines.filter((p) => !leads.some((l) => l.pipelineId === p.id))
  return (
    <div aria-label="Funis do contato" role="group" className="mt-1 flex flex-col gap-1 text-xs">
      {leads.length > 0 && (
        <ul className="flex flex-col gap-1">
          {leads.map((lead) => {
            const pipeline = pipelines.find((p) => p.id === lead.pipelineId)
            return pipeline ? <LeadRow key={lead.id} lead={lead} pipeline={pipeline} /> : null
          })}
        </ul>
      )}
      {creating ? (
        <CreateLeadForm contactId={contactId} pipelines={available} onDone={() => setCreating(false)} />
      ) : (
        available.length > 0 && (
          <button onClick={() => setCreating(true)} className="self-start font-semibold text-brand hover:underline">
            + Criar lead
          </button>
        )
      )}
    </div>
  )
}
