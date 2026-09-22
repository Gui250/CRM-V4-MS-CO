'use client'

import { MAX_VISUAL_LIMIT, NUMBER_FORMATS, VISUAL_TYPES, VISUAL_TYPE_LABELS, type NumberFormat, type Visual, type VisualOptions } from '@/lib/bi/types'
import type { BiEditorAction } from './editor-actions'

export const TITLE_INPUT_ID = 'bi-visual-title'
export const TYPE_SELECT_ID = 'bi-visual-type'

const NUMBER_FORMAT_LABELS: Record<NumberFormat, string> = { integer: 'Inteiro', decimal: 'Decimal', currency: 'Moeda (R$)', percent: 'Percentual' }
const SORTS = {
  '': 'Padrão',
  'value-desc': 'Maior valor primeiro',
  'value-asc': 'Menor valor primeiro',
  'category-asc': 'Categoria (A → Z)',
  'category-desc': 'Categoria (Z → A)',
} as const
const CHARTS = new Set<Visual['type']>(['bar', 'column', 'line', 'area', 'pie', 'donut', 'funnel'])
const QUERYLESS = new Set<Visual['type']>(['text', 'filter_list', 'filter_date'])

const LABEL = 'flex flex-col gap-1 text-xs font-semibold uppercase tracking-[0.1em]'
const CONTROL = 'h-9 border-b-2 border-ink/20 bg-mist px-2 text-sm normal-case tracking-normal outline-none focus:border-brand'
const CHECK = 'flex items-center gap-2 text-sm font-semibold'

/** Properties of the selected visual (FR-006, FR-015). Text inputs commit on blur so typing is one undo step. */
export function VisualProperties({ visual, dispatch }: { visual: Visual; dispatch: (action: BiEditorAction) => void }) {
  const setOption = (options: Partial<VisualOptions>) => dispatch({ type: 'setOption', visualId: visual.id, options })
  const sortValue = visual.options.sort ? `${visual.options.sort.by}-${visual.options.sort.dir}` : ''

  return (
    <section aria-labelledby="bi-properties-title" className="flex flex-col gap-3">
      <h2 id="bi-properties-title" className="font-mono text-[11px] font-bold tracking-widest text-muted uppercase">
        Propriedades
      </h2>
      <label className={LABEL}>
        Título
        <input
          key={visual.id}
          id={TITLE_INPUT_ID}
          defaultValue={visual.title ?? ''}
          maxLength={120}
          placeholder="Automático"
          onBlur={(e) => e.target.value !== (visual.title ?? '') && dispatch({ type: 'setTitle', visualId: visual.id, title: e.target.value })}
          className={CONTROL}
        />
      </label>
      <label className={LABEL}>
        Tipo
        <select id={TYPE_SELECT_ID} value={visual.type} onChange={(e) => dispatch({ type: 'changeType', visualId: visual.id, visualType: e.target.value as Visual['type'] })} className={CONTROL}>
          {VISUAL_TYPES.map((t) => (
            <option key={t} value={t}>
              {VISUAL_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
      </label>
      {!QUERYLESS.has(visual.type) && (
        <>
          <label className={LABEL}>
            Ordenação
            <select
              value={sortValue}
              onChange={(e) => {
                const [by, dir] = e.target.value.split('-') as ['value' | 'category', 'asc' | 'desc']
                setOption({ sort: e.target.value ? { by, dir } : undefined })
              }}
              className={CONTROL}
            >
              {Object.entries(SORTS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className={LABEL}>
            Limite de itens
            <input
              key={`${visual.id}-limit`}
              type="number"
              min={1}
              max={MAX_VISUAL_LIMIT}
              defaultValue={visual.options.limit}
              aria-describedby="bi-limit-hint"
              onBlur={(e) => {
                const limit = Math.min(MAX_VISUAL_LIMIT, Math.max(1, Math.round(Number(e.target.value)) || 1))
                if (limit !== visual.options.limit) setOption({ limit })
              }}
              className={CONTROL}
            />
            <span id="bi-limit-hint" className="text-[11px] font-normal tracking-normal text-muted normal-case">
              Mostra os maiores e agrupa o restante em “Outros”.
            </span>
          </label>
          <label className={LABEL}>
            Formato de número
            <select value={visual.options.numberFormat ?? ''} onChange={(e) => setOption({ numberFormat: (e.target.value || undefined) as NumberFormat | undefined })} className={CONTROL}>
              <option value="">Automático</option>
              {NUMBER_FORMATS.map((f) => (
                <option key={f} value={f}>
                  {NUMBER_FORMAT_LABELS[f]}
                </option>
              ))}
            </select>
          </label>
        </>
      )}
      {CHARTS.has(visual.type) && (
        <label className={CHECK}>
          <input type="checkbox" checked={visual.options.crossFilter} onChange={(e) => setOption({ crossFilter: e.target.checked })} className="accent-brand" />
          Clique filtra os outros componentes
        </label>
      )}
      {visual.type === 'kpi' && (
        <label className={CHECK}>
          <input type="checkbox" checked={!!visual.options.compareWithPreviousPeriod} onChange={(e) => setOption({ compareWithPreviousPeriod: e.target.checked })} className="accent-brand" />
          Comparar com o período anterior
        </label>
      )}
      {visual.type === 'text' && (
        <label className={LABEL}>
          Texto
          <textarea
            key={`${visual.id}-text`}
            defaultValue={visual.options.text ?? ''}
            rows={5}
            maxLength={2000}
            onBlur={(e) => e.target.value !== (visual.options.text ?? '') && setOption({ text: e.target.value })}
            className={`${CONTROL} h-auto py-2`}
          />
        </label>
      )}
    </section>
  )
}
