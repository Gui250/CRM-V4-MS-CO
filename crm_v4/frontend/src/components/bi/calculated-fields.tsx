'use client'

import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { ApiError, apiFetch } from '@/lib/api'
import { CALCULATED_PREFIX, type CalculatedField, type QueryRequest, type QueryResult } from '@/lib/bi/types'
import type { BiEditorAction } from './editor-actions'

const CONTROL = 'border-b-2 border-ink/20 bg-mist px-2 text-sm outline-none focus:border-brand'

/** Runs the expression once so the server's validation message shows before the field is added. */
function validate(field: CalculatedField) {
  const request: QueryRequest = {
    sourceId: field.sourceId,
    dimensions: [],
    measures: [{ sourceId: field.sourceId, field: `${CALCULATED_PREFIX}${field.id}` }],
    filters: [],
    calculatedFields: [field],
    limit: 1,
    groupOthers: false,
  }
  return apiFetch<QueryResult>('/api/bi/query', { method: 'POST', json: request })
}

/** Simple calculated fields over the chosen source (FR-007). */
export function CalculatedFields({ fields, sourceId, dispatch }: { fields: CalculatedField[]; sourceId: string | undefined; dispatch: (action: BiEditorAction) => void }) {
  const [name, setName] = useState('')
  const [expression, setExpression] = useState('')
  const add = useMutation({
    mutationFn: async (field: CalculatedField) => {
      await validate(field)
      return field
    },
    onSuccess: (field) => {
      dispatch({ type: 'addCalculatedField', field })
      setName('')
      setExpression('')
    },
  })
  const own = fields.filter((f) => f.sourceId === sourceId)

  return (
    <section aria-labelledby="bi-calc-title" className="flex flex-col gap-2">
      <h2 id="bi-calc-title" className="font-mono text-[11px] font-bold tracking-widest text-muted uppercase">
        Campos calculados
      </h2>
      <ul className="flex flex-col gap-1">
        {own.map((f) => (
          <li key={f.id} className="flex items-center gap-2 text-sm">
            <span className="min-w-0 flex-1 truncate">
              <strong>{f.name}</strong> <code className="font-mono text-xs text-muted">{f.expression}</code>
            </span>
            <button type="button" aria-label={`Remover campo calculado ${f.name}`} onClick={() => dispatch({ type: 'removeCalculatedField', id: f.id })} className="px-1.5 text-brand hover:bg-mist">
              ×
            </button>
          </li>
        ))}
      </ul>
      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (sourceId) add.mutate({ id: crypto.randomUUID().slice(0, 8), name: name.trim(), expression: expression.trim(), sourceId })
        }}
      >
        <input aria-label="Nome do campo calculado" placeholder="Nome" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} className={`${CONTROL} h-9`} />
        <textarea
          aria-label="Expressão"
          aria-describedby="bi-calc-help"
          placeholder="Expressão"
          value={expression}
          rows={2}
          onChange={(e) => setExpression(e.target.value)}
          className={`${CONTROL} py-1.5 font-mono`}
        />
        <p id="bi-calc-help" className="text-[11px] text-muted">
          Ex.: [Valor] * 2 ou SUM([Valor]) / COUNT([Lead])
        </p>
        {add.isError && (
          <p role="alert" className="text-xs font-semibold text-brand">
            {add.error instanceof ApiError ? add.error.message : 'Não foi possível validar a expressão.'}
          </p>
        )}
        <Button type="submit" variant="secondary" className="h-9" disabled={!sourceId || !name.trim() || !expression.trim() || add.isPending}>
          Adicionar campo calculado
        </Button>
      </form>
    </section>
  )
}
