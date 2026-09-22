import { describe, expect, it } from 'vitest'
import { emptyDefinition, reportDefinitionSchema, type ReportDefinition } from './definition.js'

const src = 'internal:whatsapp_messages'

const full = (): ReportDefinition => ({
  pages: [
    {
      id: 'p1',
      name: 'Visão geral',
      filters: [{ sourceId: src, field: 'enviada_em', op: 'between', values: ['2026-01-01', '2026-01-31'] }],
      visuals: [
        { id: 'v1', type: 'kpi', layout: { x: 0, y: 0, w: 3, h: 2 }, sourceId: src, slots: { value: [{ sourceId: src, field: 'mensagem', aggregation: 'count' }] }, options: { limit: 20, crossFilter: true } },
        {
          id: 'v2',
          type: 'column',
          layout: { x: 3, y: 0, w: 9, h: 4 },
          title: 'Por dia',
          sourceId: src,
          slots: { category: [{ sourceId: src, field: 'enviada_em', dateGrain: 'day' }], value: [{ sourceId: src, field: 'mensagem' }], legend: { sourceId: src, field: 'direcao' } },
          options: { limit: 20, crossFilter: true, sort: { by: 'category', dir: 'asc' } },
        },
        { id: 'v3', type: 'text', layout: { x: 0, y: 4, w: 12, h: 1 }, slots: {}, options: { limit: 20, crossFilter: true, text: 'Notas' } },
      ],
    },
  ],
  calculatedFields: [{ id: 'c1', name: 'Dobro', expression: '[Valor] * 2', sourceId: src }],
})

const withVisual = (visual: Record<string, unknown>) => {
  const def = full()
  return { ...def, pages: [{ ...def.pages[0]!, visuals: [visual] }] }
}

describe('reportDefinitionSchema', () => {
  it('accepts a complete definition and the empty one', () => {
    expect(reportDefinitionSchema.safeParse(full()).success).toBe(true)
    expect(reportDefinitionSchema.safeParse(emptyDefinition()).success).toBe(true)
  })

  it('fills option defaults', () => {
    const parsed = reportDefinitionSchema.parse(withVisual({ id: 'v', type: 'bar', layout: { x: 0, y: 0, w: 4, h: 3 }, sourceId: src }))
    expect(parsed.pages[0]!.visuals[0]!.options).toMatchObject({ limit: 20, crossFilter: true })
  })

  it('rejects a report without pages or with more than 20', () => {
    expect(reportDefinitionSchema.safeParse({ pages: [] }).success).toBe(false)
    const page = emptyDefinition().pages[0]!
    expect(reportDefinitionSchema.safeParse({ pages: Array.from({ length: 21 }, (_, i) => ({ ...page, id: `p${i}` })) }).success).toBe(false)
  })

  it('rejects unknown visual types and out-of-grid layouts', () => {
    expect(reportDefinitionSchema.safeParse(withVisual({ id: 'v', type: 'map', layout: { x: 0, y: 0, w: 4, h: 3 }, sourceId: src })).success).toBe(false)
    expect(reportDefinitionSchema.safeParse(withVisual({ id: 'v', type: 'bar', layout: { x: 0, y: 0, w: 13, h: 3 }, sourceId: src })).success).toBe(false)
    expect(reportDefinitionSchema.safeParse(withVisual({ id: 'v', type: 'bar', layout: { x: 0, y: 0, w: 4, h: 21 }, sourceId: src })).success).toBe(false)
  })

  it('requires a source for every visual except text', () => {
    const result = reportDefinitionSchema.safeParse(withVisual({ id: 'v', type: 'kpi', layout: { x: 0, y: 0, w: 3, h: 2 } }))
    expect(result.success).toBe(false)
  })

  it('enforces slot maximums per visual type', () => {
    const pie = { id: 'v', type: 'pie', layout: { x: 0, y: 0, w: 4, h: 3 }, sourceId: src, slots: { value: [{ sourceId: src, field: 'a' }, { sourceId: src, field: 'b' }] } }
    expect(reportDefinitionSchema.safeParse(withVisual(pie)).success).toBe(false)
    const kpiWithCategory = { id: 'v', type: 'kpi', layout: { x: 0, y: 0, w: 4, h: 3 }, sourceId: src, slots: { category: [{ sourceId: src, field: 'a' }] } }
    expect(reportDefinitionSchema.safeParse(withVisual(kpiWithCategory)).success).toBe(false)
  })

  it('rejects a legend combined with several values', () => {
    const bar = {
      id: 'v',
      type: 'bar',
      layout: { x: 0, y: 0, w: 4, h: 3 },
      sourceId: src,
      slots: { value: [{ sourceId: src, field: 'a' }, { sourceId: src, field: 'b' }], legend: { sourceId: src, field: 'c' } },
    }
    expect(reportDefinitionSchema.safeParse(withVisual(bar)).success).toBe(false)
  })

  it('caps titles, text and limits', () => {
    const base = { id: 'v', type: 'text', layout: { x: 0, y: 0, w: 4, h: 3 } }
    expect(reportDefinitionSchema.safeParse(withVisual({ ...base, title: 'x'.repeat(101) })).success).toBe(false)
    expect(reportDefinitionSchema.safeParse(withVisual({ ...base, options: { text: 'x'.repeat(2001) } })).success).toBe(false)
    expect(reportDefinitionSchema.safeParse(withVisual({ ...base, options: { limit: 1001 } })).success).toBe(false)
  })
})
