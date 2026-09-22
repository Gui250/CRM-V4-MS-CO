import {
  DEFAULT_VISUAL_LIMIT,
  SLOT_NAMES,
  SLOT_RULES,
  type AnyFieldRef,
  type Aggregation,
  type DateGrain,
  type FieldRef,
  type FieldType,
  type SlotName,
  type Visual,
  type VisualOptions,
  type VisualSlots,
  type VisualType,
} from './types'

const isDate = (type: FieldType) => type === 'date' || type === 'datetime'
const isNumeric = (type: FieldType) => type === 'number' || type === 'currency'

export const acceptedSlots = (type: VisualType): SlotName[] => SLOT_NAMES.filter((slot) => SLOT_RULES[type][slot])

export function acceptsField(type: VisualType, slot: SlotName, field: { type: FieldType }) {
  if (!SLOT_RULES[type][slot]) return false
  if (type === 'filter_date' && slot === 'category') return isDate(field.type)
  return true
}

export const defaultAggregation = (fieldType: FieldType): Aggregation => (isNumeric(fieldType) ? 'sum' : 'count')
export const defaultGrain = (): DateGrain => 'month'

const used = (slots: VisualSlots, slot: SlotName) => {
  const value = slots[slot]
  if (value === undefined) return 0
  return Array.isArray(value) ? value.length : 1
}

/** Free places left in a slot; a legend only works with a single value (backend rule). */
export function slotRoom(visual: Visual, slot: SlotName) {
  let max = SLOT_RULES[visual.type][slot]?.max ?? 0
  if (slot === 'legend' && used(visual.slots, 'value') > 1) max = 0
  if (slot === 'value' && visual.slots.legend) max = Math.min(max, 1)
  return max - used(visual.slots, slot)
}

/** Puts a field into a slot, replacing the last entry when full. Caller checks `acceptsField`. */
export function placeField(visual: Visual, slot: SlotName, ref: { sourceId: string; field: string }, fieldType: FieldType): Visual {
  const base = { sourceId: ref.sourceId, field: ref.field }
  const dim: FieldRef = isDate(fieldType) ? { ...base, dateGrain: defaultGrain() } : base
  const full = slotRoom(visual, slot) <= 0
  const slots = { ...visual.slots }
  if (slot === 'value') {
    if (full && used(slots, 'value') === 0) return visual
    const list = slots.value ?? []
    slots.value = [...(full ? list.slice(0, -1) : list), { ...base, aggregation: defaultAggregation(fieldType) }]
  } else if (slot === 'category') {
    const list = slots.category ?? []
    slots.category = [...(full ? list.slice(0, -1) : list), dim]
  } else {
    if (full && !slots[slot]) return visual // e.g. legend while there are several values
    slots[slot] = dim
  }
  return { ...visual, sourceId: visual.sourceId ?? ref.sourceId, slots }
}

type Suggestion = Pick<Visual, 'type' | 'slots' | 'options'>
const baseOptions = (): VisualOptions => ({ limit: DEFAULT_VISUAL_LIMIT, crossFilter: true })

/** Visual created when a field is dropped on the empty canvas (contracts/report-definition.md, FR-011). */
export function suggestVisualForField(ref: { sourceId: string; field: string }, fieldType: FieldType, distinctCount?: number): Suggestion {
  const base = { sourceId: ref.sourceId, field: ref.field }
  if (isNumeric(fieldType)) return { type: 'kpi', slots: { value: [{ ...base, aggregation: 'sum' }] }, options: baseOptions() }
  const count = [{ ...base, aggregation: 'count' as const }]
  if (isDate(fieldType)) {
    return { type: 'line', slots: { category: [{ ...base, dateGrain: defaultGrain() }], value: count }, options: baseOptions() }
  }
  if (distinctCount !== undefined && distinctCount <= 6) return { type: 'donut', slots: { category: [base], value: count }, options: baseOptions() }
  return { type: 'bar', slots: { category: [base], value: count }, options: { ...baseOptions(), limit: 20 } }
}

/** Second field dropped on an existing visual: may morph the type, otherwise fills the next free slot. */
export function mergeFieldIntoVisual(
  visual: Visual,
  ref: { sourceId: string; field: string },
  fieldType: FieldType,
): Visual {
  const hasValue = used(visual.slots, 'value') > 0
  const hasDateCategory = visual.slots.category?.[0]?.dateGrain !== undefined
  if ((visual.type === 'bar' || visual.type === 'column') && isDate(fieldType) && hasValue) {
    return placeField({ ...visual, type: 'line', slots: { ...visual.slots, category: [] } }, 'category', ref, fieldType)
  }
  if ((visual.type === 'bar' || visual.type === 'column') && isNumeric(fieldType) && hasDateCategory) {
    return placeField({ ...visual, type: 'line' }, 'value', ref, fieldType)
  }
  if (visual.type === 'kpi' && hasValue && !isNumeric(fieldType)) {
    // Text/boolean + number → bar (spec); a date turns the KPI into a trend line instead of doing nothing.
    return placeField({ ...visual, type: isDate(fieldType) ? 'line' : 'bar' }, 'category', ref, fieldType)
  }
  const order: SlotName[] = isNumeric(fieldType)
    ? ['value', 'category']
    : visual.type === 'pivot' && used(visual.slots, 'category') > 0
      ? ['columns', 'category', 'value']
      : ['category', 'legend', 'columns', 'value']
  const slot = order.find((s) => slotRoom(visual, s) > 0 && acceptsField(visual.type, s, { type: fieldType }))
  return slot ? placeField(visual, slot, ref, fieldType) : visual
}

/** Switch type keeping what fits; everything else is returned to be shown as pending (not saved). */
export function changeVisualType(visual: Visual, newType: VisualType): { visual: Visual; pendingFields: AnyFieldRef[] } {
  const rules = SLOT_RULES[newType]
  const pending: AnyFieldRef[] = []
  const keep = <T extends AnyFieldRef>(list: T[], max: number) => {
    pending.push(...list.slice(max))
    return list.slice(0, max)
  }
  const slots: VisualSlots = {}
  let category = visual.slots.category ?? []
  if (newType === 'filter_date') {
    // Only date fields carry a grain; a text category cannot drive a period filter.
    pending.push(...category.filter((f) => !f.dateGrain))
    category = category.filter((f) => f.dateGrain)
  }
  const keptCategory = keep(category, rules.category?.max ?? 0)
  const keptValue = keep(visual.slots.value ?? [], rules.value?.max ?? 0)
  if (keptCategory.length) slots.category = keptCategory
  if (keptValue.length) slots.value = keptValue
  // legend and columns both split by one extra dimension, so they convert into each other.
  const split = visual.slots.legend ?? visual.slots.columns
  if (split) {
    const target = rules.legend ? 'legend' : rules.columns ? 'columns' : null
    if (target && !(target === 'legend' && keptValue.length > 1)) slots[target] = split
    else pending.push(split)
  }
  return { visual: { ...visual, type: newType, slots }, pendingFields: pending }
}

/** Has the minimum fields to run a query (text never queries but is always "ready"). */
export function isVisualReady(visual: Visual) {
  const n = (slot: SlotName) => used(visual.slots, slot)
  switch (visual.type) {
    case 'text':
      return true
    case 'kpi':
      return n('value') >= 1
    case 'table':
      return n('category') + n('value') >= 1
    case 'pivot':
      return n('category') >= 1 && n('columns') === 1 && n('value') === 1
    case 'filter_list':
    case 'filter_date':
      return n('category') === 1
    default:
      return n('category') === 1 && n('value') >= 1
  }
}
