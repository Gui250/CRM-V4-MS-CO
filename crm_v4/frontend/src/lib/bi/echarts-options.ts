import type { EChartsOption } from 'echarts'
import { CHART_GRID, CHART_MUTED, CHART_TEXT, DIMMED_OPACITY, SERIES_COLORS } from './chart-theme'
import { formatBucket, formatCell, formatNumber } from './format'
import { OTHERS_LABEL, type DateGrain, type FieldType, type NumberFormat, type QueryResult, type Visual } from './types'

export type ChartExtras = {
  /** Raw category value currently cross-filtered: that point stays solid, the others are dimmed. */
  highlightValue?: unknown
  /** Grain actually shown (after drill-down); defaults to the category's own grain. */
  dateGrain?: DateGrain
}

type Shape = { categories: unknown[]; series: { raw: unknown; data: (number | null)[] }[] }

const toNumber = (v: unknown) => (v === null || v === undefined ? null : Number(v))

/** Rows → categories × series. With a legend, each legend value becomes a series (pivoted here). */
function shape(visual: Visual, result: QueryResult): Shape {
  const hasLegend = visual.slots.legend !== undefined
  const firstMeasure = (visual.slots.category?.length ?? 0) + (hasLegend ? 1 : 0)
  let categories = [...new Set(result.rows.map((r) => r[0]))]
  let series: Shape['series']
  if (hasLegend) {
    const cells = new Map(result.rows.map((r) => [JSON.stringify([r[0], r[1]]), toNumber(r[firstMeasure])]))
    series = [...new Set(result.rows.map((r) => r[1]))].map((raw) => ({
      raw,
      data: categories.map((c) => cells.get(JSON.stringify([c, raw])) ?? null),
    }))
  } else {
    series = result.columns.slice(firstMeasure).map((col, j) => ({ raw: col.label, data: result.rows.map((r) => toNumber(r[firstMeasure + j])) }))
  }
  // Order: "Outros" always last; a funnel always by value, largest first.
  const order = categories.map((_, i) => i)
  if (visual.type === 'funnel') order.sort((a, b) => (series[0]?.data[b] ?? 0) - (series[0]?.data[a] ?? 0))
  const others = order.filter((i) => categories[i] === OTHERS_LABEL)
  const final = [...order.filter((i) => categories[i] !== OTHERS_LABEL), ...others]
  categories = final.map((i) => categories[i])
  series = series.map((s) => ({ ...s, data: final.map((i) => s.data[i] ?? null) }))
  return { categories, series }
}

/** Raw category values in the order the chart shows them (ISO strings for date buckets). */
export const categoryValues = (visual: Visual, result: QueryResult) => shape(visual, result).categories

/** Maps an ECharts click back to the raw category value, for cross-filtering and drill-down. */
export function seriesPointToValue(visual: Visual, result: QueryResult, params: { dataIndex?: number }) {
  return params.dataIndex === undefined ? undefined : categoryValues(visual, result)[params.dataIndex]
}

type Parts = {
  visual: Visual
  categories: unknown[]
  series: Shape['series']
  categoryLabel: (v: unknown) => string
  seriesName: (raw: unknown) => string
  format: NumberFormat | undefined
  /** Dimming for cross-filter highlight; undefined when nothing is highlighted. */
  styleAt: (i: number) => { itemStyle: { opacity: number } } | undefined
  base: EChartsOption
}

function singleSeriesChart({ visual, categories, series, categoryLabel, seriesName, styleAt, base }: Parts): EChartsOption {
  const data = categories.map((c, i) => ({ name: categoryLabel(c), value: series[0]?.data[i] ?? 0, ...styleAt(i) }))
  const name = seriesName(series[0]?.raw ?? '')
  if (visual.type === 'funnel') {
    return { ...base, series: [{ type: 'funnel', name, sort: 'descending', left: '10%', right: '10%', top: 8, bottom: 32, data }] }
  }
  return { ...base, series: [{ type: 'pie', name, radius: visual.type === 'donut' ? ['45%', '70%'] : '70%', data }] }
}

function cartesianChart({ visual, categories, series, categoryLabel, seriesName, format, styleAt, base }: Parts): EChartsOption {
  const categoryAxis = {
    type: 'category' as const,
    data: categories.map(categoryLabel),
    axisLine: { lineStyle: { color: CHART_GRID } },
    axisLabel: { color: CHART_MUTED },
  }
  const valueAxis = {
    type: 'value' as const,
    splitLine: { lineStyle: { color: CHART_GRID } },
    axisLabel: { color: CHART_MUTED, formatter: (v: number) => formatNumber(v, format) },
  }
  const chartSeries = series.map((s) => ({
    type: visual.type === 'line' || visual.type === 'area' ? 'line' : 'bar',
    name: seriesName(s.raw),
    data: s.data.map((value, i) => {
      const style = styleAt(i)
      return style ? { value, ...style } : value
    }),
    ...(visual.type === 'area' ? { areaStyle: { opacity: 0.25 } } : {}),
  }))
  const horizontal = visual.type === 'bar'
  return {
    ...base,
    tooltip: { ...base.tooltip, trigger: 'axis' },
    grid: { left: 8, right: 16, top: 16, bottom: series.length > 1 ? 32 : 8 },
    // Horizontal bars read top-down, so the first category goes on top.
    xAxis: horizontal ? valueAxis : categoryAxis,
    yAxis: horizontal ? { ...categoryAxis, inverse: true } : valueAxis,
    series: chartSeries as EChartsOption['series'],
  }
}

/** ECharts option for bar/column/line/area/pie/donut/funnel from a query result. */
export function toChartOption(
  visual: Visual,
  result: QueryResult,
  fieldTypesByKey: Record<string, FieldType> = {},
  extras: ChartExtras = {},
): EChartsOption {
  const { categories, series } = shape(visual, result)
  const columnType = (index: number): FieldType => {
    const col = result.columns[index]
    return col ? (fieldTypesByKey[col.key] ?? col.type) : 'text'
  }
  const grain = extras.dateGrain ?? visual.slots.category?.[0]?.dateGrain
  const format = visual.options.numberFormat ?? (columnType(result.columns.length - 1) === 'currency' ? 'currency' : undefined)
  const formatValue = (v: unknown) => (typeof v === 'number' ? formatNumber(v, format) : formatCell(v, 'number', format))
  const { highlightValue } = extras
  const parts: Parts = {
    visual,
    categories,
    series,
    format,
    categoryLabel: (v) => (grain && typeof v === 'string' && v !== OTHERS_LABEL ? formatBucket(v, grain) : formatCell(v, columnType(0))),
    seriesName: (raw) => (visual.slots.legend ? formatCell(raw, columnType(1)) : String(raw)),
    styleAt: (i) => (highlightValue === undefined ? undefined : { itemStyle: { opacity: categories[i] === highlightValue ? 1 : DIMMED_OPACITY } }),
    base: {
      color: SERIES_COLORS,
      textStyle: { color: CHART_TEXT, fontFamily: 'inherit' },
      aria: { enabled: true },
      legend: { show: series.length > 1 || visual.type === 'pie' || visual.type === 'donut', bottom: 0, type: 'scroll', textStyle: { color: CHART_TEXT } },
      tooltip: { trigger: 'item', valueFormatter: (v) => formatValue(Array.isArray(v) ? v[0] : v) },
    },
  }
  return visual.type === 'pie' || visual.type === 'donut' || visual.type === 'funnel' ? singleSeriesChart(parts) : cartesianChart(parts)
}
