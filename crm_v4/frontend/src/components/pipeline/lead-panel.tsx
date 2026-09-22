'use client'

import Link from 'next/link'
import { useEffect, useId, useState } from 'react'
import { ContactAvatar } from '@/components/chat/contact-avatar'
import { Button } from '@/components/ui/button'
import { ApiError } from '@/lib/api'
import { centsToInput, displayName, formatListTime, formatPhone, parseBRL } from '@/lib/format'
import type { LeadDetail, Stage } from '@/lib/types'
import { useAssignableUsers, useDeleteLead, useLead, useUpdateLead, type LeadChanges } from '@/lib/use-pipelines'
import { STAGE_COLOR_CLASSES } from './stage-colors'

const TITLE_MAX = 120
const NOTES_MAX = 5000

const errorText = (error: unknown) => (error instanceof ApiError ? error.message : 'Algo deu errado. Tente novamente.')

function formFrom(lead: LeadDetail) {
  return { title: lead.title ?? '', value: centsToInput(lead.valueCents), assigneeId: lead.assignee?.id ?? '', notes: lead.notes ?? '' }
}

/** Only fields that differ from the saved lead; undefined when the value field is invalid. */
function changesFrom(lead: LeadDetail, form: ReturnType<typeof formFrom>): LeadChanges | undefined {
  const valueCents = parseBRL(form.value)
  if (valueCents === undefined) return undefined
  const changes: LeadChanges = {}
  if ((form.title.trim() || null) !== lead.title) changes.title = form.title.trim() || null
  if (valueCents !== lead.valueCents) changes.valueCents = valueCents
  if ((form.assigneeId || null) !== (lead.assignee?.id ?? null)) changes.assigneeId = form.assigneeId || null
  if ((form.notes || null) !== lead.notes) changes.notes = form.notes || null
  return changes
}

function History({ lead }: { lead: LeadDetail }) {
  return (
    <section aria-labelledby="lead-history" className="flex flex-col gap-2">
      <h3 id="lead-history" className="text-xs font-semibold uppercase tracking-[0.12em]">
        Histórico de etapas
      </h3>
      <ol className="flex flex-col gap-2 border-l-2 border-line pl-3 text-sm">
        {lead.history.map((entry) => (
          <li key={entry.id}>
            <p>
              {entry.fromStageName ? (
                <>
                  {entry.fromStageName} → <strong>{entry.toStageName ?? 'etapa excluída'}</strong>
                </>
              ) : (
                <>
                  Entrou em <strong>{entry.toStageName ?? 'etapa excluída'}</strong>
                </>
              )}
            </p>
            <p className="font-mono text-[11px] text-muted">
              {entry.changedBy?.name ?? 'automático'} · {formatListTime(entry.changedAt)}
            </p>
          </li>
        ))}
      </ol>
    </section>
  )
}

function LeadForm({ lead, stage, onClose }: { lead: LeadDetail; stage: Stage | undefined; onClose: () => void }) {
  const id = useId()
  const { data: users } = useAssignableUsers()
  const updateLead = useUpdateLead(lead.id)
  const deleteLead = useDeleteLead({ ...lead, contactId: lead.contact.id })
  const [form, setForm] = useState(() => formFrom(lead))
  const [confirmDelete, setConfirmDelete] = useState(false)
  const changes = changesFrom(lead, form)
  const set = (field: keyof typeof form) => (e: { target: { value: string } }) => setForm((current) => ({ ...current, [field]: e.target.value }))

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (changes && Object.keys(changes).length > 0) updateLead.mutate(changes)
      }}
    >
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-title`} className="text-xs font-semibold uppercase tracking-[0.12em]">
          Título
        </label>
        <input id={`${id}-title`} value={form.title} maxLength={TITLE_MAX} placeholder={displayName(lead.contact)} onChange={set('title')} className="h-10 border-b-2 border-ink/20 bg-mist px-3 outline-none focus:border-brand focus:bg-paper" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-value`} className="text-xs font-semibold uppercase tracking-[0.12em]">
            Valor estimado (R$)
          </label>
          <input
            id={`${id}-value`}
            inputMode="decimal"
            value={form.value}
            placeholder="0,00"
            onChange={set('value')}
            aria-invalid={changes === undefined}
            aria-describedby={changes === undefined ? `${id}-value-error` : undefined}
            className="h-10 border-b-2 border-ink/20 bg-mist px-3 font-mono outline-none focus:border-brand focus:bg-paper aria-invalid:border-brand"
          />
          {changes === undefined && (
            <p id={`${id}-value-error`} className="text-xs text-brand">
              Use o formato 5.000,00
            </p>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-assignee`} className="text-xs font-semibold uppercase tracking-[0.12em]">
            Responsável
          </label>
          <select id={`${id}-assignee`} value={form.assigneeId} onChange={set('assigneeId')} className="h-10 border-b-2 border-ink/20 bg-mist px-2 outline-none focus:border-brand">
            <option value="">Sem responsável</option>
            {users?.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-notes`} className="text-xs font-semibold uppercase tracking-[0.12em]">
          Anotações
        </label>
        <textarea id={`${id}-notes`} value={form.notes} maxLength={NOTES_MAX} rows={4} onChange={set('notes')} className="resize-y border-b-2 border-ink/20 bg-mist px-3 py-2 outline-none focus:border-brand focus:bg-paper" />
      </div>
      {stage?.kind === 'lost' && lead.lostReason && (
        <p className="bg-stage-red-bg px-3 py-2 text-sm text-stage-red">
          <strong>Motivo da perda:</strong> {lead.lostReason}
        </p>
      )}
      {(updateLead.isError || deleteLead.isError) && (
        <p role="alert" className="text-sm text-brand">
          {errorText(updateLead.error ?? deleteLead.error)}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={!changes || Object.keys(changes).length === 0 || updateLead.isPending}>
          Salvar
        </Button>
        <span className="flex-1" />
        {confirmDelete ? (
          <>
            <span className="text-sm">Excluir este lead?</span>
            <Button variant="danger" className="h-9" onClick={() => deleteLead.mutate(undefined, { onSuccess: onClose })}>
              Confirmar exclusão
            </Button>
            <Button variant="ghost" className="h-9" onClick={() => setConfirmDelete(false)}>
              Cancelar
            </Button>
          </>
        ) : (
          <Button variant="ghost" className="h-9 text-brand" onClick={() => setConfirmDelete(true)}>
            Excluir lead
          </Button>
        )}
      </div>
    </form>
  )
}

/** Side panel (full screen on phones) with the lead's details and stage history (US4). */
export function LeadPanel({ leadId, stages, onClose }: { leadId: string; stages: Stage[]; onClose: () => void }) {
  const { data: lead, isLoading, isError } = useLead(leadId)
  const stage = stages.find((s) => s.id === lead?.stageId)

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <aside role="dialog" aria-modal="false" aria-labelledby="lead-panel-title" className="fixed inset-0 z-40 flex flex-col overflow-y-auto bg-paper shadow-2xl md:inset-y-0 md:right-0 md:left-auto md:w-[28rem] md:border-l-4 md:border-brand">
      <header className="flex items-start gap-3 border-b border-line p-5">
        {lead && <ContactAvatar contact={lead.contact} size="lg" />}
        <div className="min-w-0 flex-1">
          <h2 id="lead-panel-title" className="truncate font-display text-lg font-extrabold uppercase [font-stretch:112%]">
            {lead ? lead.title || displayName(lead.contact) : 'Lead'}
          </h2>
          {lead && <p className="font-mono text-xs text-muted">{formatPhone(lead.contact.phone)}</p>}
          {stage && <span className={`mt-2 inline-block px-2 py-0.5 text-xs font-bold ${STAGE_COLOR_CLASSES[stage.color].band}`}>{stage.name}</span>}
        </div>
        <button onClick={onClose} aria-label="Fechar lead" className="px-2 text-2xl leading-none text-muted hover:text-ink">
          ×
        </button>
      </header>
      <div className="flex flex-col gap-6 p-5">
        {isLoading && <p className="text-sm text-muted">Carregando lead…</p>}
        {isError && <p className="text-sm text-brand">Não foi possível carregar este lead.</p>}
        {lead && (
          <>
            {lead.conversationId && (
              <Link href={`/chat?c=${lead.conversationId}`} className="self-start text-sm font-semibold text-brand hover:underline">
                Abrir conversa no WhatsApp →
              </Link>
            )}
            {/* Keyed on the saved values so the form resets after a save or someone else's edit. */}
            <LeadForm key={`${lead.id}-${lead.valueCents}-${lead.assignee?.id}-${lead.title}-${lead.notes}`} lead={lead} stage={stage} onClose={onClose} />
            <History lead={lead} />
          </>
        )}
      </div>
    </aside>
  )
}
