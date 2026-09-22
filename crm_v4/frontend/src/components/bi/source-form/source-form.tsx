'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/input'
import type { RefreshInterval, Source } from '@/lib/bi/types'
import { INTERVAL_LABELS, KIND_LABELS } from '../sources/labels'
import { errorText, useCreateSource, usePreviewSource, useUpdateSource, type ExternalKind, type Preview } from '../sources/use-source-admin'
import { ApiFields } from './api-fields'
import { SelectField } from './controls'
import { DatabaseFields } from './database-fields'
import { buildInput, draftFromSource, emptyDraft, validateDraft, type Draft, type Errors } from './draft'
import { applyEdits, changedEdits, FieldTypes, type FieldEdits } from './field-types'
import { KindPicker } from './kind-picker'
import { PreviewTable } from './preview-table'
import { SpreadsheetFields, type KindFieldsProps } from './spreadsheet-fields'

const NO_EDITS: FieldEdits = { types: {}, labels: {} }
const INTERVALS = Object.entries(INTERVAL_LABELS).map(([value, label]) => ({ value, label }))

function KindFields({ kind, ...props }: KindFieldsProps & { kind: ExternalKind }) {
  switch (kind) {
    case 'spreadsheet_file':
    case 'spreadsheet_url':
      return <SpreadsheetFields kind={kind} {...props} />
    case 'postgres':
    case 'mysql':
      return <DatabaseFields {...props} />
    case 'api':
      return <ApiFields {...props} />
  }
}

const inputKey = (kind: ExternalKind, draft: Draft, editing: boolean) => JSON.stringify(buildInput(kind, draft, editing))

/** Create (no `source`) or edit a source. Saving requires a successful preview of the current connection inputs. */
export function SourceForm({ source }: { source?: Source }) {
  const editing = Boolean(source)
  const router = useRouter()
  const [kind, setKind] = useState<ExternalKind | null>(source ? (source.kind as ExternalKind) : null)
  const [draft, setDraft] = useState<Draft | null>(() => (source ? draftFromSource(source) : null))
  const [initialKey] = useState(() => (source ? inputKey(source.kind as ExternalKind, draftFromSource(source), true) : null))
  const [errors, setErrors] = useState<Errors>({})
  const [focusRequest, setFocusRequest] = useState(0)
  const [preview, setPreview] = useState<{ key: string; data: Preview } | null>(null)
  const [edits, setEdits] = useState<FieldEdits>(NO_EDITS)
  const formRef = useRef<HTMLFormElement>(null)

  const previewSource = usePreviewSource()
  const create = useCreateSource()
  const update = useUpdateSource(source?.id ?? '')
  const save = editing ? update : create

  useEffect(() => {
    if (focusRequest) formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
  }, [focusRequest])

  if (!kind || !draft) {
    return (
      <KindPicker
        onPick={(picked) => {
          setKind(picked)
          setDraft(emptyDraft(picked))
        }}
      />
    )
  }

  const key = inputKey(kind, draft, editing)
  const previewValid = preview?.key === key
  const unchanged = editing && key === initialKey
  const canSave = previewValid || unchanged
  const baseFields = previewValid ? preview.data.fields : unchanged ? (source?.fields ?? []) : []

  const change = (patch: Partial<Draft>) => {
    setDraft({ ...draft, ...patch })
    setErrors((current) => Object.fromEntries(Object.entries(current).filter(([field]) => !(field in patch))))
  }
  const fail = (found: Errors) => {
    setErrors(found)
    setFocusRequest((n) => n + 1)
  }

  const runPreview = () => {
    const found = validateDraft(kind, draft, editing)
    if (Object.keys(found).length) return fail(found)
    setErrors({})
    previewSource.mutate(
      { name: draft.name.trim() || 'Prévia', kind, ...buildInput(kind, draft, editing), ...(source ? { sourceId: source.id } : {}) },
      {
        onSuccess: (data) => {
          setPreview({ key, data })
          setEdits(NO_EDITS)
          if (data.sheets?.length && draft.upload) setDraft({ ...draft, upload: { ...draft.upload, sheets: data.sheets } })
        },
      },
    )
  }

  const submit = () => {
    const name = draft.name.trim()
    if (name.length < 2 || name.length > 100) return fail({ name: 'Informe um nome de 2 a 100 caracteres.' })
    const refreshInterval: RefreshInterval = kind === 'spreadsheet_file' ? 'manual' : draft.refreshInterval
    const input = buildInput(kind, draft, editing)
    const fieldChanges = changedEdits(baseFields, edits)
    const onSuccess = () => router.push('/fontes')
    if (!source) {
      // ponytail: fieldTypes/fieldLabels ride along on create; the backend must seed them (see report).
      create.mutate({ name, kind, ...input, refreshInterval, ...fieldChanges }, { onSuccess })
      return
    }
    update.mutate(
      {
        ...(name !== source.name ? { name } : {}),
        ...(refreshInterval !== source.refreshInterval ? { refreshInterval } : {}),
        ...(unchanged ? {} : { config: input.config }),
        ...(input.secrets ? { secrets: input.secrets } : {}),
        ...fieldChanges,
      },
      { onSuccess },
    )
  }

  return (
    <form
      ref={formRef}
      noValidate
      className="flex flex-col gap-8"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <div className="flex flex-wrap items-center gap-3">
        <span className="bg-ink px-2 py-1 font-mono text-xs font-bold uppercase tracking-wider text-white">{KIND_LABELS[kind]}</span>
        {!editing && (
          <Button
            variant="ghost"
            className="h-8 px-2 underline"
            onClick={() => {
              setKind(null)
              setDraft(null)
              setPreview(null)
              setErrors({})
            }}
          >
            Trocar tipo
          </Button>
        )}
      </div>

      <section className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome da fonte" value={draft.name} maxLength={100} error={errors.name} onChange={(e) => change({ name: e.target.value })} />
        {kind === 'spreadsheet_file' ? (
          <p className="self-end pb-2 text-sm text-muted">Planilhas enviadas por arquivo são atualizadas manualmente (envie um novo arquivo).</p>
        ) : (
          <SelectField
            label="Atualização"
            value={draft.refreshInterval}
            options={INTERVALS}
            onChange={(e) => change({ refreshInterval: e.target.value as RefreshInterval })}
          />
        )}
      </section>

      <section aria-labelledby="connection-title" className="flex flex-col gap-4 bg-paper p-5 cut-corner [--cut:16px]">
        <h2 id="connection-title" className="font-display text-lg font-extrabold uppercase [font-stretch:112%]">
          Conexão
        </h2>
        <KindFields kind={kind} draft={draft} onChange={change} errors={errors} />
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="secondary" onClick={runPreview} disabled={previewSource.isPending}>
            {previewSource.isPending ? 'Testando…' : 'Testar e ver prévia'}
          </Button>
          {preview && !previewValid && !unchanged && <p className="text-sm text-muted">A configuração mudou; teste de novo para salvar.</p>}
        </div>
        {previewSource.isError && (
          <p role="alert" className="border-l-4 border-brand bg-brand/5 px-3 py-2 text-sm">
            {errorText(previewSource.error)}
          </p>
        )}
      </section>

      {previewValid && <PreviewTable fields={applyEdits(preview.data.fields, edits)} rows={preview.data.rows} totalRowsRead={preview.data.totalRowsRead} />}
      {baseFields.length > 0 && <FieldTypes fields={baseFields} edits={edits} onChange={setEdits} />}

      {save.isError && (
        <p role="alert" className="bg-brand px-3 py-2 text-sm font-semibold text-white">
          {errorText(save.error)}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={!canSave || save.isPending} aria-describedby={canSave ? undefined : 'save-hint'}>
          {save.isPending ? 'Salvando…' : 'Salvar fonte'}
        </Button>
        {!canSave && (
          <p id="save-hint" className="text-sm text-muted">
            Teste a conexão e veja a prévia antes de salvar.
          </p>
        )}
      </div>
    </form>
  )
}
