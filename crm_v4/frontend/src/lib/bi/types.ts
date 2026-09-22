// Mirrors backend/src/models/bi/definition.ts (the Zod source of truth) and the API shapes in
// specs/004-interactive-bi-reports/contracts/openapi.yaml. Keep both in sync by hand.

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
export const SLOT_NAMES = ['category', 'value', 'legend', 'columns'] as const
export const NUMBER_FORMATS = ['integer', 'decimal', 'currency', 'percent'] as const

export type FieldType = (typeof FIELD_TYPES)[number]
export type Aggregation = (typeof AGGREGATIONS)[number]
export type DateGrain = (typeof DATE_GRAINS)[number]
export type FilterOp = (typeof FILTER_OPS)[number]
export type VisualType = (typeof VISUAL_TYPES)[number]
export type SlotName = (typeof SLOT_NAMES)[number]
export type NumberFormat = (typeof NUMBER_FORMATS)[number]

export const VISUAL_TYPE_LABELS: Record<VisualType, string> = {
  kpi: 'Indicador',
  bar: 'Barras',
  column: 'Colunas',
  line: 'Linha',
  area: 'Área',
  pie: 'Pizza',
  donut: 'Rosca',
  funnel: 'Funil',
  table: 'Tabela',
  pivot: 'Tabela dinâmica',
  filter_list: 'Filtro de lista',
  filter_date: 'Filtro de período',
  text: 'Texto',
}

export const AGGREGATION_LABELS: Record<Aggregation, string> = {
  sum: 'Soma',
  avg: 'Média',
  count: 'Contagem',
  count_distinct: 'Contagem distinta',
  min: 'Mínimo',
  max: 'Máximo',
}

export const DATE_GRAIN_LABELS: Record<DateGrain, string> = {
  day: 'Dia',
  week: 'Semana',
  month: 'Mês',
  quarter: 'Trimestre',
  year: 'Ano',
}

/** Prefix that marks a FieldRef/MeasureRef pointing at a calculated field (`calc:<id>`). */
export const CALCULATED_PREFIX = 'calc:'
export const DEFAULT_VISUAL_LIMIT = 20
export const MAX_VISUAL_LIMIT = 1000
export const MAX_VISUALS_PER_PAGE = 30
export const MAX_PAGES = 20
export const OTHERS_LABEL = 'Outros'
export const REPORT_TIME_ZONE = 'America/Sao_Paulo'

/** Max fields per slot; a missing slot means the type does not accept it. Mirrors SLOT_RULES in backend/src/models/bi/definition.ts. */
export const SLOT_RULES: Record<VisualType, Partial<Record<SlotName, { max: number }>>> = {
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

export type Scalar = string | number | boolean

export type SourceField = { key: string; label: string; type: FieldType; detectedType: FieldType; invalidCount: number }
export type FieldRef = { sourceId: string; field: string; dateGrain?: DateGrain }
export type MeasureRef = { sourceId: string; field: string; aggregation?: Aggregation }
export type AnyFieldRef = FieldRef | MeasureRef
export type Filter = { sourceId: string; field: string; op: FilterOp; values: Scalar[] }
export type CalculatedField = { id: string; name: string; expression: string; sourceId: string }

export type VisualLayout = { x: number; y: number; w: number; h: number }
export type VisualSlots = { category?: FieldRef[]; value?: MeasureRef[]; legend?: FieldRef; columns?: FieldRef }
export type VisualSort = { by: 'value' | 'category'; dir: 'asc' | 'desc' }
export type VisualOptions = {
  sort?: VisualSort
  limit: number
  numberFormat?: NumberFormat
  crossFilter: boolean
  compareWithPreviousPeriod?: boolean
  text?: string
}
export type Visual = {
  id: string
  type: VisualType
  layout: VisualLayout
  title?: string
  sourceId?: string
  slots: VisualSlots
  options: VisualOptions
}
/** A page of the report (`Page` in definition.ts; renamed to avoid clashing with lib/types `Page<T>`). */
export type ReportPage = { id: string; name: string; filters: Filter[]; visuals: Visual[] }
export type ReportDefinition = { pages: ReportPage[]; calculatedFields: CalculatedField[] }

export type QueryRequest = {
  sourceId: string
  dimensions: FieldRef[]
  measures: MeasureRef[]
  filters: Filter[]
  calculatedFields: CalculatedField[]
  sort?: VisualSort
  limit: number
  groupOthers: boolean
}
export type Column = { key: string; label: string; type: FieldType }
export type QueryResult = {
  columns: Column[]
  rows: unknown[][]
  ignoredRows?: number
  dataAsOf: string
  staleWarning: string | null
  missingFields: string[]
}

export type SourceKind = 'internal' | 'spreadsheet_file' | 'spreadsheet_url' | 'postgres' | 'mysql' | 'api'
export type RefreshInterval = 'manual' | '15m' | '1h' | '6h' | '24h'
export type Source = {
  id: string
  name: string
  kind: SourceKind
  fields: SourceField[]
  refreshInterval: RefreshInterval
  rowCount?: number
  lastRefreshedAt: string | null
  lastAttemptAt: string | null
  lastError: string | null
  isRefreshing: boolean
  config?: Record<string, unknown>
  maskedSecrets?: Record<string, unknown>
}
export type Relationship = { id: string; leftSourceId: string; leftField: string; rightSourceId: string; rightField: string }

export type ReportPermission = 'owner' | 'edit' | 'view'
export type ReportSummary = { id: string; name: string; ownerName: string; permission: ReportPermission; updatedAt: string }
export type Report = ReportSummary & { definition: ReportDefinition; version: number }
export type Share = { userId: string; userName: string; permission: 'edit' | 'view' }
