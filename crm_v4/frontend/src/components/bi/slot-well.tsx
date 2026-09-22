'use client'

import { useState, type DragEvent } from 'react'
import { acceptsField } from '@/lib/bi/slots'
import { AGGREGATIONS, AGGREGATION_LABELS, DATE_GRAINS, DATE_GRAIN_LABELS, type AnyFieldRef, type CalculatedField, type SlotName, type Source, type Visual } from '@/lib/bi/types'
import type { BiEditorAction } from './editor-actions'
import { FIELD_MIME, fieldInfo, hasDragType, readFieldPayload, slotLabel } from './field-meta'

const SELECT = 'h-7 max-w-28 border border-line bg-paper px-1 text-xs'

const slotRefs = (visual: Visual, slot: SlotName): AnyFieldRef[] => {
  const value = visual.slots[slot]
  return value === undefined ? [] : Array.isArray(value) ? value : [value]
}

/** Drop target for one slot of the selected visual, with a chip per field (aggregation/grain, remove). */
export function SlotWell({
  visual,
  slot,
  sourcesById,
  calculatedFields,
  dispatch,
}: {
  visual: Visual
  slot: SlotName
  sourcesById: Record<string, Source>
  calculatedFields: CalculatedField[]
  dispatch: (action: BiEditorAction) => void
}) {
  const [message, setMessage] = useState<string | null>(null)
  const [over, setOver] = useState(false)
  const label = slotLabel(visual.type, slot)

  function onDrop(e: DragEvent) {
    setOver(false)
    const field = readFieldPayload(e.dataTransfer)
    if (!field) return
    e.preventDefault()
    if (!acceptsField(visual.type, slot, field)) return setMessage(`Este campo não serve para ${label}.`)
    setMessage(null)
    dispatch({ type: 'dropField', visualId: visual.id, slot, field: { sourceId: field.sourceId, field: field.field }, fieldType: field.type })
  }

  return (
    <div
      role="group"
      aria-label={`Espaço ${label}`}
      onDragOver={(e) => {
        if (!hasDragType(e.dataTransfer, FIELD_MIME)) return
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
      className={`flex flex-col gap-1 border border-dashed p-2 ${over ? 'border-brand bg-stage-red-bg' : 'border-ink/30'}`}
    >
      <p className="font-mono text-[10px] font-bold tracking-wider uppercase">{label}</p>
      {slotRefs(visual, slot).map((ref, index) => {
        const info = fieldInfo(sourcesById, calculatedFields, ref)
        return (
          <div key={`${ref.field}-${index}`} className="flex items-center gap-1 bg-ink py-0.5 pl-2 text-xs text-white">
            <span className="min-w-0 flex-1 truncate font-semibold">{info.label}</span>
            {'aggregation' in ref && slot === 'value' && (
              <select
                aria-label={`Agregação de ${info.label}`}
                value={ref.aggregation ?? 'count'}
                onChange={(e) => dispatch({ type: 'setAggregation', visualId: visual.id, index, aggregation: e.target.value as (typeof AGGREGATIONS)[number] })}
                className={`${SELECT} text-ink`}
              >
                {AGGREGATIONS.map((a) => (
                  <option key={a} value={a}>
                    {AGGREGATION_LABELS[a]}
                  </option>
                ))}
              </select>
            )}
            {'dateGrain' in ref && ref.dateGrain && slot !== 'value' && (
              <select
                aria-label={`Agrupamento de ${info.label}`}
                value={ref.dateGrain}
                onChange={(e) => dispatch({ type: 'setDateGrain', visualId: visual.id, slot, index, grain: e.target.value as (typeof DATE_GRAINS)[number] })}
                className={`${SELECT} text-ink`}
              >
                {DATE_GRAINS.map((g) => (
                  <option key={g} value={g}>
                    {DATE_GRAIN_LABELS[g]}
                  </option>
                ))}
              </select>
            )}
            <button
              type="button"
              aria-label={`Remover ${info.label} de ${label}`}
              onClick={() => dispatch({ type: 'removeField', visualId: visual.id, slot, index })}
              className="px-1.5 hover:bg-brand"
            >
              ×
            </button>
          </div>
        )
      })}
      {slotRefs(visual, slot).length === 0 && <p className="text-xs text-muted">Arraste um campo aqui</p>}
      {message && (
        <p role="alert" className="text-xs font-semibold text-brand">
          {message}
        </p>
      )}
    </div>
  )
}
