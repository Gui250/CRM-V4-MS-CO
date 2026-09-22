import {
  AGGREGATION_LABELS,
  CALCULATED_PREFIX,
  FIELD_TYPES,
  VISUAL_TYPES,
  VISUAL_TYPE_LABELS,
  type AnyFieldRef,
  type CalculatedField,
  type FieldType,
  type SlotName,
  type Source,
  type Visual,
  type VisualType,
} from '@/lib/bi/types'

/** HTML5 drag payload types (research §10). */
export const FIELD_MIME = 'application/x-bi-field'
export const VISUAL_MIME = 'application/x-bi-visual'

export type FieldPayload = { sourceId: string; field: string; type: FieldType }
export type FieldInfo = { label: string; type: FieldType }

export const isVisualType = (value: string): value is VisualType => (VISUAL_TYPES as readonly string[]).includes(value)

export const hasDragType = (dataTransfer: DataTransfer, type: string) => [...(dataTransfer.types ?? [])].includes(type)

export function readFieldPayload(dataTransfer: DataTransfer): FieldPayload | null {
  const raw = dataTransfer.getData(FIELD_MIME)
  if (!raw) return null
  try {
    const value = JSON.parse(raw) as Partial<FieldPayload>
    const valid = typeof value.sourceId === 'string' && typeof value.field === 'string' && FIELD_TYPES.includes(value.type as FieldType)
    return valid ? (value as FieldPayload) : null
  } catch {
    return null // not ours: another app dropped text with our MIME type
  }
}

export const TYPE_ICONS: Record<FieldType, string> = {
  text: 'Aa',
  number: '#',
  currency: 'R$',
  date: 'D',
  datetime: 'DH',
  boolean: 'S/N',
}

/** Label and type of a field, including calculated fields (`calc:<id>`, always numeric). */
export function fieldInfo(
  sourcesById: Record<string, Source>,
  calculatedFields: CalculatedField[],
  ref: { sourceId: string; field: string },
): FieldInfo {
  if (ref.field.startsWith(CALCULATED_PREFIX)) {
    const calc = calculatedFields.find((c) => c.id === ref.field.slice(CALCULATED_PREFIX.length))
    return { label: calc?.name ?? ref.field, type: 'number' }
  }
  const field = sourcesById[ref.sourceId]?.fields.find((f) => f.key === ref.field)
  return field ? { label: field.label, type: field.type } : { label: ref.field, type: 'text' }
}

export function refLabel(ref: AnyFieldRef, info: FieldInfo) {
  return 'aggregation' in ref && ref.aggregation ? `${AGGREGATION_LABELS[ref.aggregation]} de ${info.label}` : info.label
}

/** Title shown on a visual: the author's, or one built from its fields ("Contagem de Lead por Etapa"). */
export function visualTitle(visual: Visual, sourcesById: Record<string, Source>, calculatedFields: CalculatedField[]) {
  if (visual.title?.trim()) return visual.title.trim()
  const label = (ref: AnyFieldRef) => refLabel(ref, fieldInfo(sourcesById, calculatedFields, ref))
  const values = (visual.slots.value ?? []).map(label)
  const categories = (visual.slots.category ?? []).map(label)
  if (values.length && categories.length) return `${values.join(', ')} por ${categories.join(', ')}`
  return [...values, ...categories][0] ?? VISUAL_TYPE_LABELS[visual.type]
}

export function slotLabel(type: VisualType, slot: SlotName) {
  if (slot === 'category') return type === 'pivot' ? 'Linhas' : type === 'filter_list' || type === 'filter_date' ? 'Campo' : 'Categoria'
  return { value: 'Valor', legend: 'Legenda', columns: 'Colunas' }[slot]
}
