import { acceptsField, changeVisualType, placeField } from './slots'
import {
  DEFAULT_VISUAL_LIMIT,
  MAX_PAGES,
  MAX_VISUALS_PER_PAGE,
  type Aggregation,
  type AnyFieldRef,
  type CalculatedField,
  type DateGrain,
  type FieldType,
  type Report,
  type ReportDefinition,
  type ReportPage,
  type SlotName,
  type Visual,
  type VisualLayout,
  type VisualOptions,
  type VisualSlots,
  type VisualType,
} from './types'

export const UNDO_HISTORY = 20
const GRID_COLUMNS = 12
const MAX_ROWS_PER_VISUAL = 20

export type EditorState = {
  definition: ReportDefinition
  name: string
  pageId: string
  selectedVisualId: string | null
  past: ReportDefinition[]
  future: ReportDefinition[]
  savedVersion: number
  savedDefinition: ReportDefinition
  savedName: string
  isDirty: boolean
  /** Fields that no longer fit after a type change (editor-only, never saved). */
  pendingFields: Record<string, AnyFieldRef[]>
}

export type LayoutItem = VisualLayout & { i: string }

export type EditorAction =
  | { type: 'addVisual'; visualType: VisualType; sourceId?: string; layout?: Partial<VisualLayout>; slots?: VisualSlots; options?: Partial<VisualOptions> }
  | { type: 'removeVisual'; visualId: string }
  | { type: 'selectVisual'; visualId: string | null }
  | { type: 'moveResize'; layouts: LayoutItem[] }
  | { type: 'nudge'; visualId: string; dx: number; dy: number }
  | { type: 'resizeBy'; visualId: string; dw: number; dh: number }
  | { type: 'dropField'; visualId: string; slot: SlotName; field: { sourceId: string; field: string }; fieldType: FieldType }
  | { type: 'removeField'; visualId: string; slot: SlotName; index: number }
  | { type: 'setAggregation'; visualId: string; index: number; aggregation: Aggregation }
  | { type: 'setDateGrain'; visualId: string; slot: 'category' | 'legend' | 'columns'; index: number; grain: DateGrain }
  | { type: 'setOption'; visualId: string; options: Partial<VisualOptions> }
  | { type: 'setTitle'; visualId: string; title: string }
  | { type: 'changeType'; visualId: string; visualType: VisualType }
  | { type: 'addCalculatedField'; field: CalculatedField }
  | { type: 'updateCalculatedField'; id: string; patch: Partial<Omit<CalculatedField, 'id'>> }
  | { type: 'removeCalculatedField'; id: string }
  | { type: 'replacePage'; page: ReportPage }
  | { type: 'addPage'; name?: string }
  | { type: 'renamePage'; pageId: string; name: string }
  | { type: 'movePage'; pageId: string; toIndex: number }
  | { type: 'removePage'; pageId: string }
  | { type: 'setPage'; pageId: string }
  | { type: 'rename'; name: string }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'markSaved'; version: number; definition?: ReportDefinition; name?: string }
  | { type: 'load'; report: Report }

const newId = () => crypto.randomUUID().slice(0, 8)

const DEFAULT_SIZE: Record<VisualType, [number, number]> = {
  kpi: [3, 2],
  bar: [6, 4],
  column: [6, 4],
  line: [6, 4],
  area: [6, 4],
  pie: [6, 4],
  donut: [6, 4],
  funnel: [6, 4],
  table: [6, 5],
  pivot: [8, 5],
  filter_list: [3, 2],
  filter_date: [3, 2],
  text: [4, 2],
}

export function initEditorState(report: Report): EditorState {
  return {
    definition: report.definition,
    name: report.name,
    pageId: report.definition.pages[0]?.id ?? '',
    selectedVisualId: null,
    past: [],
    future: [],
    savedVersion: report.version,
    savedDefinition: report.definition,
    savedName: report.name,
    isDirty: false,
    pendingFields: {},
  }
}

export const currentPage = (state: EditorState) => state.definition.pages.find((p) => p.id === state.pageId) ?? state.definition.pages[0]!

// Reference equality is enough: every edit builds a new definition and undo restores the exact old object.
const dirty = (s: Pick<EditorState, 'definition' | 'name' | 'savedDefinition' | 'savedName'>) =>
  s.definition !== s.savedDefinition || s.name !== s.savedName

/** Keeps page and selection pointing at things that still exist (after undo/redo/removals). */
function withValidPointers(state: EditorState): EditorState {
  const page = state.definition.pages.find((p) => p.id === state.pageId) ?? state.definition.pages[0]!
  const selected = page.visuals.some((v) => v.id === state.selectedVisualId) ? state.selectedVisualId : null
  return { ...state, pageId: page.id, selectedVisualId: selected, isDirty: dirty(state) }
}

/** Every definition change goes through here so history and dirtiness stay consistent. */
function commit(state: EditorState, definition: ReportDefinition, extra: Partial<EditorState> = {}): EditorState {
  if (definition === state.definition) return state
  return withValidPointers({ ...state, ...extra, definition, past: [...state.past, state.definition].slice(-UNDO_HISTORY), future: [] })
}

const mapPages = (state: EditorState, fn: (page: ReportPage) => ReportPage): ReportDefinition => ({
  ...state.definition,
  pages: state.definition.pages.map(fn),
})

const mapCurrentPage = (state: EditorState, fn: (page: ReportPage) => ReportPage) =>
  mapPages(state, (page) => (page.id === currentPage(state).id ? fn(page) : page))

function updateVisual(state: EditorState, visualId: string, fn: (visual: Visual) => Visual): EditorState {
  let changed = false
  const definition = mapPages(state, (page) => {
    if (!page.visuals.some((v) => v.id === visualId)) return page
    return {
      ...page,
      visuals: page.visuals.map((v) => {
        if (v.id !== visualId) return v
        const next = fn(v)
        changed ||= next !== v
        return next
      }),
    }
  })
  return changed ? commit(state, definition) : state
}

const overlaps = (a: VisualLayout, b: VisualLayout) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

/** First free spot scanning rows top-down, left to right. */
function firstFreeSpot(visuals: Visual[], w: number, h: number): VisualLayout {
  for (let y = 0; ; y++) {
    for (let x = 0; x + w <= GRID_COLUMNS; x++) {
      const spot = { x, y, w, h }
      if (!visuals.some((v) => overlaps(v.layout, spot))) return spot
    }
  }
}

const clamp = (n: number, min: number, max: number) => Math.min(Math.max(n, min), max)

function clampLayout({ x, y, w, h }: VisualLayout): VisualLayout {
  const width = clamp(w, 1, GRID_COLUMNS)
  return { x: clamp(x, 0, GRID_COLUMNS - width), y: Math.max(0, y), w: width, h: clamp(h, 1, MAX_ROWS_PER_VISUAL) }
}

const sameLayout = (a: VisualLayout, b: VisualLayout) => a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h

const withoutKey = <T,>(record: Record<string, T>, key: string) => Object.fromEntries(Object.entries(record).filter(([k]) => k !== key))

type Handlers = { [K in EditorAction['type']]: (state: EditorState, action: Extract<EditorAction, { type: K }>) => EditorState }

function addVisual(state: EditorState, action: Extract<EditorAction, { type: 'addVisual' }>): EditorState {
  const page = currentPage(state)
  if (page.visuals.length >= MAX_VISUALS_PER_PAGE) return state
  const [w, h] = DEFAULT_SIZE[action.visualType]
  const size = { w: action.layout?.w ?? w, h: action.layout?.h ?? h }
  const layout =
    action.layout?.x !== undefined && action.layout.y !== undefined
      ? clampLayout({ x: action.layout.x, y: action.layout.y, ...size })
      : firstFreeSpot(page.visuals, size.w, size.h)
  const visual: Visual = {
    id: newId(),
    type: action.visualType,
    layout,
    slots: action.slots ?? {},
    options: { limit: DEFAULT_VISUAL_LIMIT, crossFilter: true, ...action.options },
  }
  if (action.sourceId && action.visualType !== 'text') visual.sourceId = action.sourceId
  const definition = mapCurrentPage(state, (p) => ({ ...p, visuals: [...p.visuals, visual] }))
  return { ...commit(state, definition), selectedVisualId: visual.id }
}

function moveResize(state: EditorState, layouts: LayoutItem[]): EditorState {
  // react-grid-layout reports the layout on mount too; ignore it when nothing moved.
  const byId = new Map(layouts.map((l) => [l.i, l]))
  let changed = false
  const definition = mapCurrentPage(state, (p) => ({
    ...p,
    visuals: p.visuals.map((v) => {
      const next = byId.get(v.id)
      if (!next) return v
      const layout = clampLayout(next)
      if (sameLayout(layout, v.layout)) return v
      changed = true
      return { ...v, layout }
    }),
  }))
  return changed ? commit(state, definition) : state
}

function removeField(v: Visual, slot: SlotName, index: number): Visual {
  if (slot === 'category') return { ...v, slots: { ...v.slots, category: v.slots.category?.filter((_, i) => i !== index) } }
  if (slot === 'value') return { ...v, slots: { ...v.slots, value: v.slots.value?.filter((_, i) => i !== index) } }
  const { [slot]: _removed, ...slots } = v.slots
  return { ...v, slots }
}

function setDateGrain(v: Visual, slot: 'category' | 'legend' | 'columns', index: number, grain: DateGrain): Visual {
  if (slot === 'category') {
    const category = v.slots.category?.map((f, i) => (i === index ? { ...f, dateGrain: grain } : f))
    return { ...v, slots: { ...v.slots, category } }
  }
  const ref = v.slots[slot]
  return ref ? { ...v, slots: { ...v.slots, [slot]: { ...ref, dateGrain: grain } } } : v
}

function changeType(state: EditorState, visualId: string, visualType: VisualType): EditorState {
  let pending: AnyFieldRef[] = []
  const next = updateVisual(state, visualId, (v) => {
    if (v.type === visualType) return v
    const result = changeVisualType(v, visualType)
    pending = result.pendingFields
    return result.visual
  })
  if (next === state) return state
  const pendingFields = withoutKey(state.pendingFields, visualId)
  if (pending.length) pendingFields[visualId] = pending
  return { ...next, pendingFields }
}

const setCalculatedFields = (state: EditorState, fn: (fields: CalculatedField[]) => CalculatedField[]) =>
  commit(state, { ...state.definition, calculatedFields: fn(state.definition.calculatedFields) })

function addPage(state: EditorState, name?: string): EditorState {
  const pages = state.definition.pages
  if (pages.length >= MAX_PAGES) return state
  const page: ReportPage = { id: newId(), name: name ?? `Página ${pages.length + 1}`, filters: [], visuals: [] }
  return commit(state, { ...state.definition, pages: [...pages, page] }, { pageId: page.id, selectedVisualId: null })
}

function movePage(state: EditorState, pageId: string, toIndex: number): EditorState {
  const pages = [...state.definition.pages]
  const from = pages.findIndex((p) => p.id === pageId)
  const to = clamp(toIndex, 0, pages.length - 1)
  if (from < 0 || from === to) return state
  pages.splice(to, 0, ...pages.splice(from, 1))
  return commit(state, { ...state.definition, pages })
}

function removePage(state: EditorState, pageId: string): EditorState {
  const pages = state.definition.pages
  const index = pages.findIndex((p) => p.id === pageId)
  if (index < 0 || pages.length <= 1) return state
  const remaining = pages.filter((p) => p.id !== pageId)
  const nextPageId = state.pageId === pageId ? remaining[Math.max(0, index - 1)]!.id : state.pageId
  return commit(state, { ...state.definition, pages: remaining }, { pageId: nextPageId })
}

function undo(state: EditorState): EditorState {
  const previous = state.past.at(-1)
  if (!previous) return state
  return withValidPointers({ ...state, definition: previous, past: state.past.slice(0, -1), future: [state.definition, ...state.future] })
}

function redo(state: EditorState): EditorState {
  const [next, ...future] = state.future
  if (!next) return state
  return withValidPointers({ ...state, definition: next, past: [...state.past, state.definition].slice(-UNDO_HISTORY), future })
}

const handlers: Handlers = {
  addVisual,
  removeVisual: (s, a) =>
    commit(
      s,
      mapPages(s, (p) => ({ ...p, visuals: p.visuals.filter((v) => v.id !== a.visualId) })),
      { pendingFields: withoutKey(s.pendingFields, a.visualId) },
    ),
  selectVisual: (s, a) => ({ ...s, selectedVisualId: a.visualId }),
  moveResize: (s, a) => moveResize(s, a.layouts),
  nudge: (s, a) =>
    updateVisual(s, a.visualId, (v) => {
      const layout = clampLayout({ ...v.layout, x: v.layout.x + a.dx, y: v.layout.y + a.dy })
      return sameLayout(layout, v.layout) ? v : { ...v, layout }
    }),
  resizeBy: (s, a) =>
    updateVisual(s, a.visualId, (v) => {
      const { x, w, h } = v.layout
      const layout = clampLayout({ ...v.layout, w: Math.min(w + a.dw, GRID_COLUMNS - x), h: h + a.dh })
      return sameLayout(layout, v.layout) ? v : { ...v, layout }
    }),
  dropField: (s, a) =>
    updateVisual(s, a.visualId, (v) => (acceptsField(v.type, a.slot, { type: a.fieldType }) ? placeField(v, a.slot, a.field, a.fieldType) : v)),
  removeField: (s, a) => updateVisual(s, a.visualId, (v) => removeField(v, a.slot, a.index)),
  setAggregation: (s, a) =>
    updateVisual(s, a.visualId, (v) => ({
      ...v,
      slots: { ...v.slots, value: v.slots.value?.map((m, i) => (i === a.index ? { ...m, aggregation: a.aggregation } : m)) },
    })),
  setDateGrain: (s, a) => updateVisual(s, a.visualId, (v) => setDateGrain(v, a.slot, a.index, a.grain)),
  setOption: (s, a) => updateVisual(s, a.visualId, (v) => ({ ...v, options: { ...v.options, ...a.options } })),
  setTitle: (s, a) => updateVisual(s, a.visualId, (v) => ({ ...v, title: a.title })),
  changeType: (s, a) => changeType(s, a.visualId, a.visualType),
  addCalculatedField: (s, a) => setCalculatedFields(s, (list) => [...list, a.field]),
  updateCalculatedField: (s, a) => setCalculatedFields(s, (list) => list.map((c) => (c.id === a.id ? { ...c, ...a.patch } : c))),
  removeCalculatedField: (s, a) => setCalculatedFields(s, (list) => list.filter((c) => c.id !== a.id)),
  // "Relatório sugerido": take the suggested content but keep the page's identity.
  replacePage: (s, a) => commit(s, mapCurrentPage(s, (p) => ({ ...a.page, id: p.id })), { selectedVisualId: null }),
  addPage: (s, a) => addPage(s, a.name),
  renamePage: (s, a) => commit(s, mapPages(s, (p) => (p.id === a.pageId ? { ...p, name: a.name } : p))),
  movePage: (s, a) => movePage(s, a.pageId, a.toIndex),
  removePage: (s, a) => removePage(s, a.pageId),
  setPage: (s, a) => (s.definition.pages.some((p) => p.id === a.pageId) ? { ...s, pageId: a.pageId, selectedVisualId: null } : s),
  rename: (s, a) => withValidPointers({ ...s, name: a.name }),
  undo,
  redo,
  markSaved: (s, a) =>
    withValidPointers({ ...s, savedVersion: a.version, savedDefinition: a.definition ?? s.definition, savedName: a.name ?? s.name }),
  load: (_, a) => initEditorState(a.report),
}

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  const handler = handlers[action.type] as (s: EditorState, a: EditorAction) => EditorState
  return handler(state, action)
}
