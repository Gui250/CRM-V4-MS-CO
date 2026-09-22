'use client'

import { useEffect, useRef } from 'react'
import type { EChartsOption } from 'echarts'
import { BarChart, FunnelChart, LineChart, PieChart } from 'echarts/charts'
import { AriaComponent, GridComponent, LegendComponent, TooltipComponent } from 'echarts/components'
import * as echarts from 'echarts/core'
import type { ECElementEvent, EChartsType } from 'echarts/core'
import { SVGRenderer } from 'echarts/renderers'

// Modular registration keeps the bundle to the charts we actually draw. SVG keeps text crisp and exports cleanly.
echarts.use([BarChart, LineChart, PieChart, FunnelChart, GridComponent, TooltipComponent, LegendComponent, AriaComponent, SVGRenderer])

type Props = {
  option: EChartsOption
  ariaLabel: string
  className?: string
  onItemClick?: (params: ECElementEvent) => void
  /** Receives the instance (e.g. to export an image) and null on unmount. */
  onReady?: (chart: EChartsType | null) => void
}

export function EChart({ option, ariaLabel, className, onItemClick, onReady }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const chartRef = useRef<EChartsType | null>(null)
  // Latest callbacks without re-creating the chart when the parent re-renders.
  const handlers = useRef({ onItemClick, onReady })
  useEffect(() => {
    handlers.current = { onItemClick, onReady }
  })

  useEffect(() => {
    const chart = echarts.init(ref.current!, undefined, { renderer: 'svg' })
    chartRef.current = chart
    chart.on('click', (params) => handlers.current.onItemClick?.(params as ECElementEvent))
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => chart.resize())
    observer?.observe(ref.current!)
    handlers.current.onReady?.(chart)
    return () => {
      observer?.disconnect()
      handlers.current.onReady?.(null)
      chart.dispose()
      chartRef.current = null
    }
  }, [])

  useEffect(() => {
    chartRef.current?.setOption(option, true)
  }, [option])

  return <div ref={ref} role="img" aria-label={ariaLabel} className={className} />
}
