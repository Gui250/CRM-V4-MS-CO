'use client'

import { acceptedSlots, acceptsField } from '@/lib/bi/slots'
import { CALCULATED_PREFIX, FIELD_TYPES, type CalculatedField, type FieldType, type Relationship, type SlotName, type Source, type Visual } from '@/lib/bi/types'
import { FIELD_TYPE_LABELS } from './sources/labels'
import { FIELD_MIME, TYPE_ICONS, slotLabel, type FieldPayload } from './field-meta'
import { Menu } from './menu'

type Item = FieldPayload & { label: string }

type Actions = { onAddToSlot: (field: FieldPayload, slot: SlotName) => void; onCreateVisual: (field: FieldPayload) => void }

function FieldItem({ item, visual, onAddToSlot, onCreateVisual }: { item: Item; visual: Visual | null } & Actions) {
  const payload: FieldPayload = { sourceId: item.sourceId, field: item.field, type: item.type }
  const slots = visual ? acceptedSlots(visual.type).filter((slot) => acceptsField(visual.type, slot, item)) : []
  return (
    <li
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(FIELD_MIME, JSON.stringify(payload))
        e.dataTransfer.effectAllowed = 'copy'
      }}
      className="flex cursor-grab items-center gap-2 py-1 pr-1 pl-2 text-sm hover:bg-mist active:cursor-grabbing"
    >
      <span aria-hidden className="w-7 shrink-0 font-mono text-[10px] font-bold text-brand">
        {TYPE_ICONS[item.type]}
      </span>
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      <Menu
        label={`Adicionar ${item.label} a…`}
        className="grid size-6 place-items-center text-base leading-none text-muted hover:bg-ink hover:text-white"
        items={[
          ...slots.map((slot) => ({ label: slotLabel(visual!.type, slot), onSelect: () => onAddToSlot(payload, slot) })),
          { label: 'Novo componente', onSelect: () => onCreateVisual(payload) },
        ]}
      >
        <span aria-hidden>+</span>
      </Menu>
    </li>
  )
}

function sourceItems(source: Source, calculatedFields: CalculatedField[]): Item[] {
  const fields = source.fields.map((f) => ({ sourceId: source.id, field: f.key, type: f.type, label: f.label }))
  const calculated = calculatedFields
    .filter((c) => c.sourceId === source.id)
    .map((c) => ({ sourceId: source.id, field: `${CALCULATED_PREFIX}${c.id}`, type: 'number' as FieldType, label: `ƒ ${c.name}` }))
  return [...fields, ...calculated]
}

function FieldGroups({ items, heading, ...rest }: { items: Item[]; heading?: string; visual: Visual | null } & Actions) {
  return (
    <div className="flex flex-col gap-2">
      {heading && <h3 className="text-xs font-bold">{heading}</h3>}
      {FIELD_TYPES.map((type) => {
        const group = items.filter((i) => i.type === type)
        if (!group.length) return null
        return (
          <div key={type}>
            <p className="font-mono text-[10px] tracking-wider text-muted uppercase">{FIELD_TYPE_LABELS[type]}</p>
            <ul aria-label={`Campos de ${heading ?? 'fonte'}: ${FIELD_TYPE_LABELS[type]}`}>
              {group.map((item) => (
                <FieldItem key={`${item.sourceId}:${item.field}`} item={item} {...rest} />
              ))}
            </ul>
          </div>
        )
      })}
    </div>
  )
}

/** Fields of the active source (and related ones), draggable onto slots or the canvas, or added via menu. */
export function FieldList({
  source,
  sources,
  relationships,
  calculatedFields,
  visual,
  ...actions
}: {
  source: Source | undefined
  sources: Source[]
  relationships: Relationship[]
  calculatedFields: CalculatedField[]
  visual: Visual | null
} & Actions) {
  if (!source) return <p className="text-sm text-muted">Escolha uma fonte de dados.</p>
  const relatedIds = relationships.flatMap((r) =>
    r.leftSourceId === source.id ? [r.rightSourceId] : r.rightSourceId === source.id ? [r.leftSourceId] : [],
  )
  const related = sources.filter((s) => s.id !== source.id && relatedIds.includes(s.id))
  return (
    <section aria-labelledby="bi-fields-title" className="flex flex-col gap-3">
      <h2 id="bi-fields-title" className="font-mono text-[11px] font-bold tracking-widest text-muted uppercase">
        Campos · {source.name}
      </h2>
      <FieldGroups items={sourceItems(source, calculatedFields)} visual={visual} {...actions} />
      {related.length > 0 && (
        <div className="flex flex-col gap-3 border-t border-line pt-3">
          <h2 className="font-mono text-[11px] font-bold tracking-widest text-muted uppercase">Fontes relacionadas</h2>
          {related.map((s) => (
            <FieldGroups key={s.id} heading={s.name} items={sourceItems(s, [])} visual={visual} {...actions} />
          ))}
        </div>
      )}
    </section>
  )
}
