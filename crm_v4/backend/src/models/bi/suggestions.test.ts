import { describe, expect, it } from 'vitest'
import { sourceField } from '../../test/bi-fixtures.js'
import { reportDefinitionSchema } from './definition.js'
import { listInternalSources } from './internal-sources.js'
import { suggestPage, suggestVisualForField } from './suggestions.js'
import { templateDefinition } from './templates.js'

const S = 'src'

describe('suggestVisualForField', () => {
  it.each([
    [sourceField('valor', 'currency'), undefined, 'kpi'],
    [sourceField('data', 'date'), undefined, 'line'],
    [sourceField('canal', 'text'), 4, 'donut'],
    [sourceField('vendedor', 'text'), 12, 'bar'],
    [sourceField('ativo', 'boolean'), 2, 'donut'],
  ] as const)('%o with %s values → %s', (field, distinct, type) => {
    expect(suggestVisualForField(S, field, distinct).type).toBe(type)
  })

  it('fills the slots so the visual renders right away', () => {
    expect(suggestVisualForField(S, sourceField('data', 'date')).slots).toEqual({
      category: [{ sourceId: S, field: 'data', dateGrain: 'month' }],
      value: [{ sourceId: S, field: 'data', aggregation: 'count' }],
    })
  })
})

describe('suggestPage', () => {
  it('builds KPIs, a time series, a ranking and a breakdown without overlaps', () => {
    const fields = [sourceField('data', 'date'), sourceField('vendedor', 'text'), sourceField('regiao', 'text'), sourceField('valor', 'currency'), sourceField('custo', 'number')]
    const page = suggestPage({ id: S, fields }, { vendedor: 12, regiao: 4 })
    expect(page.visuals.map((visual) => visual.type)).toEqual(['kpi', 'kpi', 'line', 'bar', 'donut'])
    expect(page.visuals[3]!.slots.category![0]!.field).toBe('vendedor')
    const cells = new Set<string>()
    for (const { layout } of page.visuals) {
      for (let x = layout.x; x < layout.x + layout.w; x++) {
        for (let y = layout.y; y < layout.y + layout.h; y++) {
          expect(cells.has(`${x},${y}`)).toBe(false)
          cells.add(`${x},${y}`)
        }
      }
    }
    expect(reportDefinitionSchema.safeParse({ pages: [page] }).success).toBe(true)
  })

  it('falls back to counts when the source has only text fields', () => {
    const page = suggestPage({ id: S, fields: [sourceField('nome', 'text'), sourceField('cidade', 'text')] }, { nome: 500, cidade: 5 })
    expect(page.visuals.map((visual) => visual.type)).toEqual(['kpi', 'donut'])
    expect(page.visuals[0]!.slots.value![0]).toEqual({ sourceId: S, field: 'nome', aggregation: 'count' })
  })
})

describe('templates', () => {
  it('"Atendimento WhatsApp" is valid and only uses existing internal fields', () => {
    const definition = templateDefinition('whatsapp_attendance')
    expect(reportDefinitionSchema.safeParse(definition).success).toBe(true)
    const fieldsBySource = new Map(listInternalSources().map((source) => [source.id, new Set(source.fields.map((field) => field.key))]))
    for (const visual of definition.pages.flatMap((page) => page.visuals)) {
      const refs = [...(visual.slots.category ?? []), ...(visual.slots.value ?? [])]
      for (const ref of refs) expect(fieldsBySource.get(ref.sourceId)?.has(ref.field)).toBe(true)
    }
  })
})
