import { z } from 'zod'
import { DEFAULT_VISUAL_LIMIT, MAX_EXPRESSION_LENGTH, MAX_VISUAL_LIMIT } from './limits.js'

export const FIELD_TYPES = ['text', 'number', 'currency', 'date', 'datetime', 'boolean'] as const
export const AGGREGATIONS = ['sum', 'avg', 'count', 'count_distinct', 'min', 'max'] as const
export const DATE_GRAINS = ['day', 'week', 'month', 'quarter', 'year'] as const
export const FILTER_OPS = ['in', 'not_in', 'between', 'gte', 'lte', 'is_null', 'not_null'] as const
export const VISUAL_TYPES = [
  'kpi',
  'bar',
  'column',
  'line',
  'area',
  'pie',
  'donut',
  'funnel',
  'table',
  'pivot',
  'filter_list',
  'filter_date',
  'text',
] as const

export type FieldType = (typeof FIELD_TYPES)[number]
export type Aggregation = (typeof AGGREGATIONS)[number]
export type DateGrain = (typeof DATE_GRAINS)[number]
export type VisualType = (typeof VISUAL_TYPES)[number]
export type SlotName = 'category' | 'value' | 'legend' | 'columns'

/** Prefix that marks a FieldRef/MeasureRef pointing at a calculated field instead of a source column. */
export const CALCULATED_PREFIX = 'calc:'

export const fieldTypeSchema = z.enum(FIELD_TYPES)

export const sourceFieldSchema = z.object({
  key: z.string().min(1).max(200),
  label: z.string().min(1).max(200),
  detectedType: fieldTypeSchema,
  type: fieldTypeSchema,
  invalidCount: z.number().int().min(0),
})
export type SourceField = z.infer<typeof sourceFieldSchema>

const sourceId = z.string().min(1).max(100)
const fieldKey = z.string().min(1).max(200)
const scalar = z.union([z.string().max(500), z.number(), z.boolean()])

export const fieldRefSchema = z.object({ sourceId, field: fieldKey, dateGrain: z.enum(DATE_GRAINS).optional() })
export const measureRefSchema = z.object({ sourceId, field: fieldKey, aggregation: z.enum(AGGREGATIONS).optional() })
export const filterSchema = z.object({
  sourceId,
  field: fieldKey,
  op: z.enum(FILTER_OPS),
  values: z.array(scalar).max(500).default([]),
})
export const calculatedFieldSchema = z.object({
  id: z.string().min(1).max(50),
  name: z.string().min(1).max(60),
  expression: z.string().min(1).max(MAX_EXPRESSION_LENGTH),
  sourceId,
})

export type FieldRef = z.infer<typeof fieldRefSchema>
export type MeasureRef = z.infer<typeof measureRefSchema>
export type Filter = z.infer<typeof filterSchema>
export type CalculatedField = z.infer<typeof calculatedFieldSchema>

type SlotRule = { max: number }
/** Maximum fields per slot; a missing slot means the visual type does not accept it (contracts/report-definition.md). */
export const SLOT_RULES: Record<VisualType, Partial<Record<SlotName, SlotRule>>> = {
  kpi: { value: { max: 1 } },
  bar: { category: { max: 1 }, value: { max: 5 }, legend: { max: 1 } },
  column: { category: { max: 1 }, value: { max: 5 }, legend: { max: 1 } },
  line: { category: { max: 1 }, value: { max: 5 }, legend: { max: 1 } },
  area: { category: { max: 1 }, value: { max: 5 }, legend: { max: 1 } },
  pie: { category: { max: 1 }, value: { max: 1 } },
  donut: { category: { max: 1 }, value: { max: 1 } },
  funnel: { category: { max: 1 }, value: { max: 1 } },
  table: { category: { max: 5 }, value: { max: 5 } },
  pivot: { category: { max: 2 }, value: { max: 1 }, columns: { max: 1 } },
  filter_list: { category: { max: 1 } },
  filter_date: { category: { max: 1 } },
  text: {},
}

const slotsSchema = z.object({
  category: z.array(fieldRefSchema).max(5).optional(),
  value: z.array(measureRefSchema).max(5).optional(),
  legend: fieldRefSchema.optional(),
  columns: fieldRefSchema.optional(),
})

const optionsSchema = z.object({
  sort: z.object({ by: z.enum(['value', 'category']), dir: z.enum(['asc', 'desc']) }).optional(),
  limit: z.number().int().min(1).max(MAX_VISUAL_LIMIT).default(DEFAULT_VISUAL_LIMIT),
  numberFormat: z.enum(['integer', 'decimal', 'currency', 'percent']).optional(),
  crossFilter: z.boolean().default(true),
  compareWithPreviousPeriod: z.boolean().optional(),
  text: z.string().max(2000).optional(),
})

const slotCount = (slots: z.infer<typeof slotsSchema>, slot: SlotName) => {
  const value = slots[slot]
  if (value === undefined) return 0
  return Array.isArray(value) ? value.length : 1
}

export const visualSchema = z
  .object({
    id: z.string().min(1).max(50),
    type: z.enum(VISUAL_TYPES),
    layout: z.object({
      x: z.number().int().min(0).max(11),
      y: z.number().int().min(0),
      w: z.number().int().min(1).max(12),
      h: z.number().int().min(1).max(20),
    }),
    title: z.string().max(100).optional(),
    sourceId: sourceId.optional(),
    slots: slotsSchema.default({}),
    options: optionsSchema.default({ limit: DEFAULT_VISUAL_LIMIT, crossFilter: true }),
  })
  .superRefine((visual, ctx) => {
    if (visual.type !== 'text' && !visual.sourceId) {
      ctx.addIssue({ code: 'custom', path: ['sourceId'], message: 'Escolha uma fonte de dados para o componente.' })
    }
    const rules = SLOT_RULES[visual.type]
    for (const slot of ['category', 'value', 'legend', 'columns'] as const) {
      const used = slotCount(visual.slots, slot)
      const max = rules[slot]?.max ?? 0
      if (used > max) {
        ctx.addIssue({ code: 'custom', path: ['slots', slot], message: `O componente aceita no máximo ${max} campo(s) em "${slot}".` })
      }
    }
    // A legend splits a single series; with several values the values themselves are the series.
    if (visual.slots.legend && slotCount(visual.slots, 'value') > 1) {
      ctx.addIssue({ code: 'custom', path: ['slots', 'legend'], message: 'Use legenda com apenas um valor.' })
    }
  })
export type Visual = z.infer<typeof visualSchema>

export const pageSchema = z.object({
  id: z.string().min(1).max(50),
  name: z.string().min(1).max(60),
  filters: z.array(filterSchema).max(50).default([]),
  visuals: z.array(visualSchema).max(30).default([]),
})
export type Page = z.infer<typeof pageSchema>

export const reportDefinitionSchema = z.object({
  pages: z.array(pageSchema).min(1).max(20),
  calculatedFields: z.array(calculatedFieldSchema).max(50).default([]),
})
export type ReportDefinition = z.infer<typeof reportDefinitionSchema>

export const emptyDefinition = (): ReportDefinition => ({
  pages: [{ id: 'p1', name: 'Página 1', filters: [], visuals: [] }],
  calculatedFields: [],
})

export const queryRequestSchema = z.object({
  sourceId,
  dimensions: z.array(fieldRefSchema).max(5).default([]),
  measures: z.array(measureRefSchema).max(5).default([]),
  filters: z.array(filterSchema).max(50).default([]),
  calculatedFields: z.array(calculatedFieldSchema).max(50).default([]),
  sort: z.object({ by: z.enum(['value', 'category']), dir: z.enum(['asc', 'desc']) }).optional(),
  limit: z.number().int().min(1).max(MAX_VISUAL_LIMIT).default(DEFAULT_VISUAL_LIMIT),
  groupOthers: z.boolean().default(true),
})
export type QueryRequest = z.infer<typeof queryRequestSchema>
