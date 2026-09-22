import { describe, expect, it } from 'vitest'
import { currentPage, editorReducer, initEditorState, UNDO_HISTORY, type EditorAction, type EditorState } from './editor-reducer'
import { makeDefinition, makePage, makeVisual } from './test-helpers'
import type { Report } from './types'

const S = 'internal:messages'
const report = (partial: Partial<Report> = {}): Report => ({
  id: 'r1',
  name: 'Atendimento',
  ownerName: 'Ana',
  permission: 'owner',
  updatedAt: '2026-01-01T00:00:00Z',
  version: 1,
  definition: makeDefinition(),
  ...partial,
})
const run = (state: EditorState, ...actions: EditorAction[]) => actions.reduce(editorReducer, state)
const visuals = (s: EditorState) => currentPage(s).visuals
const withVisual = (visual = makeVisual()) => initEditorState(report({ definition: makeDefinition({ pages: [makePage({ visuals: [visual] })] }) }))

describe('editorReducer: visuals', () => {
  it('addVisual uses the default size, first free spot, and selects it', () => {
    const s = run(initEditorState(report()), { type: 'addVisual', visualType: 'kpi', sourceId: S }, { type: 'addVisual', visualType: 'bar', sourceId: S })
    expect(visuals(s).map((v) => v.layout)).toEqual([
      { x: 0, y: 0, w: 3, h: 2 },
      { x: 3, y: 0, w: 6, h: 4 },
    ])
    expect(s.selectedVisualId).toBe(visuals(s)[1]!.id)
    expect(visuals(s)[1]).toMatchObject({ type: 'bar', sourceId: S, options: { limit: 20, crossFilter: true } })
  })
  it('addVisual wraps to the next free row', () => {
    const s = run(initEditorState(report()), ...Array.from({ length: 3 }, () => ({ type: 'addVisual' as const, visualType: 'pivot' as const, sourceId: S })))
    expect(visuals(s).map((v) => [v.layout.x, v.layout.y])).toEqual([
      [0, 0],
      [0, 5],
      [0, 10],
    ])
  })
  it('removeVisual drops it and clears the selection', () => {
    const s = run(withVisual(), { type: 'selectVisual', visualId: 'v1' }, { type: 'removeVisual', visualId: 'v1' })
    expect(visuals(s)).toEqual([])
    expect(s.selectedVisualId).toBeNull()
  })
  it('moveResize applies layouts; an unchanged layout is a no-op', () => {
    const s0 = withVisual()
    expect(editorReducer(s0, { type: 'moveResize', layouts: [{ i: 'v1', x: 0, y: 0, w: 6, h: 4 }] })).toBe(s0)
    const s = editorReducer(s0, { type: 'moveResize', layouts: [{ i: 'v1', x: 2, y: 1, w: 4, h: 3 }] })
    expect(visuals(s)[0]!.layout).toEqual({ x: 2, y: 1, w: 4, h: 3 })
  })
  it('nudge and resizeBy clamp to the grid', () => {
    let s = run(withVisual(), { type: 'nudge', visualId: 'v1', dx: 10, dy: -3 })
    expect(visuals(s)[0]!.layout).toMatchObject({ x: 6, y: 0 })
    s = run(s, { type: 'resizeBy', visualId: 'v1', dw: 3, dh: 30 })
    expect(visuals(s)[0]!.layout).toEqual({ x: 6, y: 0, w: 6, h: 20 })
  })
  it('dropField fills slots with default aggregation and grain', () => {
    const s = run(
      withVisual(makeVisual({ type: 'column' })),
      { type: 'dropField', visualId: 'v1', slot: 'category', field: { sourceId: S, field: 'sentAt' }, fieldType: 'date' },
      { type: 'dropField', visualId: 'v1', slot: 'value', field: { sourceId: S, field: 'amount' }, fieldType: 'currency' },
      { type: 'dropField', visualId: 'v1', slot: 'value', field: { sourceId: S, field: 'id' }, fieldType: 'text' },
    )
    expect(visuals(s)[0]!.slots).toEqual({
      category: [{ sourceId: S, field: 'sentAt', dateGrain: 'month' }],
      value: [
        { sourceId: S, field: 'amount', aggregation: 'sum' },
        { sourceId: S, field: 'id', aggregation: 'count' },
      ],
    })
  })
  it('dropField rejects fields the slot does not accept', () => {
    const s0 = withVisual(makeVisual({ type: 'filter_date' }))
    expect(run(s0, { type: 'dropField', visualId: 'v1', slot: 'category', field: { sourceId: S, field: 'agent' }, fieldType: 'text' })).toBe(s0)
  })
  it('removeField, setAggregation, setDateGrain, setOption, setTitle', () => {
    const v = makeVisual({
      slots: { category: [{ sourceId: S, field: 'sentAt', dateGrain: 'month' }], value: [{ sourceId: S, field: 'a', aggregation: 'sum' }], legend: { sourceId: S, field: 'b' } },
    })
    const s = run(
      withVisual(v),
      { type: 'removeField', visualId: 'v1', slot: 'legend', index: 0 },
      { type: 'setAggregation', visualId: 'v1', index: 0, aggregation: 'avg' },
      { type: 'setDateGrain', visualId: 'v1', slot: 'category', index: 0, grain: 'week' },
      { type: 'setOption', visualId: 'v1', options: { limit: 5, numberFormat: 'currency', sort: { by: 'value', dir: 'desc' } } },
      { type: 'setTitle', visualId: 'v1', title: 'Receita' },
    )
    expect(visuals(s)[0]).toMatchObject({
      title: 'Receita',
      slots: { category: [{ dateGrain: 'week' }], value: [{ aggregation: 'avg' }] },
      options: { limit: 5, numberFormat: 'currency', sort: { by: 'value', dir: 'desc' } },
    })
    expect(visuals(s)[0]!.slots.legend).toBeUndefined()
  })
  it('changeType keeps what fits and parks the rest in pendingFields', () => {
    const v = makeVisual({ type: 'table', slots: { category: [{ sourceId: S, field: 'a' }, { sourceId: S, field: 'b' }] } })
    const s = run(withVisual(v), { type: 'changeType', visualId: 'v1', visualType: 'filter_list' })
    expect(visuals(s)[0]).toMatchObject({ type: 'filter_list', slots: { category: [{ field: 'a' }] } })
    expect(s.pendingFields).toEqual({ v1: [{ sourceId: S, field: 'b' }] })
  })
})

describe('editorReducer: calculated fields and pages', () => {
  const calc = { id: 'c1', name: 'Ticket', expression: '[amount] / 2', sourceId: S }
  it('adds, updates and removes calculated fields', () => {
    let s = run(initEditorState(report()), { type: 'addCalculatedField', field: calc })
    s = run(s, { type: 'updateCalculatedField', id: 'c1', patch: { name: 'Ticket médio' } })
    expect(s.definition.calculatedFields).toEqual([{ ...calc, name: 'Ticket médio' }])
    expect(run(s, { type: 'removeCalculatedField', id: 'c1' }).definition.calculatedFields).toEqual([])
  })
  it('addPage switches to it; removePage keeps at least one', () => {
    let s = run(initEditorState(report()), { type: 'addPage' })
    expect(s.definition.pages.map((p) => p.name)).toEqual(['Página 1', 'Página 2'])
    expect(s.pageId).toBe(s.definition.pages[1]!.id)
    s = run(s, { type: 'removePage', pageId: s.pageId })
    expect(s.pageId).toBe('p1')
    expect(run(s, { type: 'removePage', pageId: 'p1' })).toBe(s)
  })
  it('addPage stops at 20 pages', () => {
    const s = run(initEditorState(report()), ...Array.from({ length: 25 }, () => ({ type: 'addPage' as const })))
    expect(s.definition.pages).toHaveLength(20)
  })
  it('renamePage, movePage, setPage', () => {
    let s = run(initEditorState(report()), { type: 'addPage', name: 'Vendas' }, { type: 'renamePage', pageId: 'p1', name: 'Resumo' })
    const vendas = s.pageId
    s = run(s, { type: 'movePage', pageId: vendas, toIndex: 0 }, { type: 'setPage', pageId: 'p1' })
    expect(s.definition.pages.map((p) => p.name)).toEqual(['Vendas', 'Resumo'])
    expect(s.pageId).toBe('p1')
  })
  it('replacePage takes the suggested content and keeps the page id', () => {
    const s = run(initEditorState(report()), { type: 'replacePage', page: makePage({ id: 'x', name: 'Sugerido', visuals: [makeVisual()] }) })
    expect(s.definition.pages).toEqual([makePage({ id: 'p1', name: 'Sugerido', visuals: [makeVisual()] })])
  })
})

describe('editorReducer: history and dirty state', () => {
  const add = { type: 'addVisual', visualType: 'kpi', sourceId: S } as const
  it('undo and redo', () => {
    let s = run(initEditorState(report()), add)
    s = run(s, { type: 'undo' })
    expect(visuals(s)).toEqual([])
    expect(s.selectedVisualId).toBeNull()
    s = run(s, { type: 'redo' })
    expect(visuals(s)).toHaveLength(1)
  })
  it('a new change clears the redo stack', () => {
    const s = run(initEditorState(report()), add, { type: 'undo' }, add)
    expect(s.future).toEqual([])
  })
  it(`keeps only the last ${UNDO_HISTORY} steps (the 21st pushes the oldest out)`, () => {
    const addCalc = (i: number) => ({ type: 'addCalculatedField' as const, field: { id: `c${i}`, name: 'n', expression: '1', sourceId: S } })
    let s = run(initEditorState(report()), ...Array.from({ length: 21 }, (_, i) => addCalc(i)))
    expect(s.past).toHaveLength(UNDO_HISTORY)
    s = run(s, ...Array.from({ length: 25 }, () => ({ type: 'undo' as const })))
    expect(s.definition.calculatedFields.map((c) => c.id)).toEqual(['c0'])
  })
  it('selection and page switching are not history', () => {
    const s = run(withVisual(), { type: 'selectVisual', visualId: 'v1' }, { type: 'setPage', pageId: 'p1' })
    expect(s.past).toEqual([])
    expect(s.isDirty).toBe(false)
  })
  it('isDirty follows the last saved definition and name', () => {
    let s = run(initEditorState(report()), add)
    expect(s.isDirty).toBe(true)
    s = run(s, { type: 'markSaved', version: 2 })
    expect(s).toMatchObject({ isDirty: false, savedVersion: 2 })
    s = run(s, { type: 'rename', name: 'Outro' })
    expect(s.isDirty).toBe(true)
    s = run(s, { type: 'rename', name: 'Atendimento' })
    expect(s.isDirty).toBe(false)
    s = run(s, add, { type: 'undo' })
    expect(s.isDirty).toBe(false)
  })
  it('load resets everything from a report', () => {
    const s = run(initEditorState(report()), add, { type: 'load', report: report({ name: 'Novo', version: 7 }) })
    expect(s).toMatchObject({ name: 'Novo', savedVersion: 7, past: [], future: [], isDirty: false, pageId: 'p1' })
  })
})
