'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type { FieldType, Source } from '@/lib/bi/types'
import { useRelationships, useSources } from '@/lib/bi/use-bi'
import { SelectField } from '../source-form/controls'
import { errorText, useCreateRelationship, useDeleteRelationship } from './use-source-admin'

/** Mirrors COMPATIBLE in backend/src/controllers/bi-sources.ts. */
const COMPATIBLE: Record<FieldType, string> = { text: 'text', boolean: 'text', number: 'number', currency: 'number', date: 'date', datetime: 'date' }
const EMPTY = { leftSourceId: '', leftField: '', rightSourceId: '', rightField: '' }

const label = (sources: Source[], sourceId: string, key: string) => {
  const source = sources.find((s) => s.id === sourceId)
  return `${source?.name ?? sourceId}.${source?.fields.find((f) => f.key === key)?.label ?? key}`
}

export function RelationshipsPanel() {
  const { data: sources = [] } = useSources()
  const { data: relationships = [] } = useRelationships()
  const create = useCreateRelationship()
  const remove = useDeleteRelationship()
  const [form, setForm] = useState(EMPTY)

  const withFields = sources.filter((source) => source.fields.length > 0)
  const left = sources.find((s) => s.id === form.leftSourceId)
  const right = sources.find((s) => s.id === form.rightSourceId)
  const leftType = left?.fields.find((f) => f.key === form.leftField)?.type
  const rightFields = (right?.fields ?? []).filter((f) => !leftType || COMPATIBLE[f.type] === COMPATIBLE[leftType])
  const sourceOptions = (exclude: string) => [
    { value: '', label: 'Escolha a fonte' },
    ...withFields.filter((s) => s.id !== exclude).map((s) => ({ value: s.id, label: s.name })),
  ]
  const fieldOptions = (fields: Source['fields']) => [{ value: '', label: 'Escolha o campo' }, ...fields.map((f) => ({ value: f.key, label: f.label }))]
  const complete = form.leftSourceId && form.leftField && form.rightSourceId && form.rightField
  const error = create.error ?? remove.error

  return (
    <section aria-labelledby="relationships-title" className="flex flex-col gap-4">
      <div>
        <h2 id="relationships-title" className="font-display text-lg font-extrabold uppercase [font-stretch:112%]">
          Relacionamentos
        </h2>
        <p className="text-sm text-muted">Ligue campos de duas fontes (ex.: telefone) para usar dados de ambas no mesmo gráfico.</p>
      </div>

      {relationships.length === 0 ? (
        <p className="text-sm text-muted">Nenhum relacionamento.</p>
      ) : (
        <ul aria-label="Relacionamentos" className="divide-y divide-line border-y border-line">
          {relationships.map((rel) => {
            const text = `${label(sources, rel.leftSourceId, rel.leftField)} ↔ ${label(sources, rel.rightSourceId, rel.rightField)}`
            return (
              <li key={rel.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <span className="font-mono text-sm">{text}</span>
                <Button variant="ghost" className="h-8 px-2 text-brand" aria-label={`Remover ${text}`} disabled={remove.isPending} onClick={() => remove.mutate(rel.id)}>
                  Remover
                </Button>
              </li>
            )
          })}
        </ul>
      )}

      <form
        aria-label="Novo relacionamento"
        className="grid gap-4 bg-paper p-5 cut-corner [--cut:16px] sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault()
          create.mutate(form, { onSuccess: () => setForm(EMPTY) })
        }}
      >
        <SelectField
          label="Fonte A"
          value={form.leftSourceId}
          options={sourceOptions(form.rightSourceId)}
          onChange={(e) => setForm({ ...form, leftSourceId: e.target.value, leftField: '', rightField: '' })}
        />
        <SelectField
          label="Campo A"
          value={form.leftField}
          disabled={!left}
          options={fieldOptions(left?.fields ?? [])}
          onChange={(e) => setForm({ ...form, leftField: e.target.value, rightField: '' })}
        />
        <SelectField
          label="Fonte B"
          value={form.rightSourceId}
          options={sourceOptions(form.leftSourceId)}
          onChange={(e) => setForm({ ...form, rightSourceId: e.target.value, rightField: '' })}
        />
        <SelectField
          label="Campo B"
          value={form.rightField}
          disabled={!right}
          hint={leftType ? 'Só aparecem campos de tipo compatível com o campo A.' : undefined}
          options={fieldOptions(rightFields)}
          onChange={(e) => setForm({ ...form, rightField: e.target.value })}
        />
        {error && (
          <p role="alert" className="border-l-4 border-brand bg-brand/5 px-3 py-2 text-sm sm:col-span-2">
            {errorText(error)}
          </p>
        )}
        <Button type="submit" className="justify-self-start" disabled={!complete || create.isPending}>
          Adicionar relacionamento
        </Button>
      </form>
    </section>
  )
}
