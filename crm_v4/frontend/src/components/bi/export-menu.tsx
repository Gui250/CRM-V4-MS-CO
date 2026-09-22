'use client'

import { toPng } from 'html-to-image'
import { useCallback, useEffect, useState, type RefObject } from 'react'
import { flushSync } from 'react-dom'
import { CHART_BACKGROUND } from '@/lib/bi/chart-theme'
import { toDayInput } from './visuals/date-presets'
import { Menu } from './menu'

/** "Gerado em" instant for the export header; refreshed right before every export or print. */
export function useExportTimestamp(): [Date, () => void] {
  const [generatedAt, setGeneratedAt] = useState(() => new Date())
  const refresh = useCallback(() => flushSync(() => setGeneratedAt(new Date())), [])
  useEffect(() => {
    window.addEventListener('beforeprint', refresh)
    return () => window.removeEventListener('beforeprint', refresh)
  }, [refresh])
  return [generatedAt, refresh]
}

const safeName = (text: string) => text.replace(/[\\/:*?"<>|]+/g, '-').trim()

/** Exports the current page (FR-033): PNG of `targetRef`, or PDF through the print dialog. */
export function ExportMenu({
  targetRef,
  reportName,
  pageName,
  onBeforeExport,
}: {
  targetRef: RefObject<HTMLElement | null>
  reportName: string
  pageName: string
  onBeforeExport: () => void
}) {
  const [failed, setFailed] = useState(false)

  async function exportPng() {
    const node = targetRef.current
    if (!node) return
    onBeforeExport()
    setFailed(false)
    node.classList.add('bi-exporting') // shows .bi-export-header while capturing (print.css)
    try {
      const url = await toPng(node, { backgroundColor: CHART_BACKGROUND, pixelRatio: 2 })
      const link = Object.assign(document.createElement('a'), {
        href: url,
        download: `${safeName(reportName)} - ${safeName(pageName)} - ${toDayInput(new Date().toISOString())}.png`,
      })
      link.click()
    } catch {
      setFailed(true) // shown below; nothing else to recover
    } finally {
      node.classList.remove('bi-exporting')
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Menu
        label="Exportar"
        className="inline-flex h-9 items-center gap-1 border border-ink/80 px-3 text-sm font-semibold hover:bg-mist"
        items={[
          { label: 'Imagem (PNG)', onSelect: () => void exportPng() },
          {
            label: 'PDF',
            onSelect: () => {
              onBeforeExport()
              window.print()
            },
          },
        ]}
      >
        Exportar <span aria-hidden>▾</span>
      </Menu>
      {failed && (
        <span role="alert" className="text-xs font-semibold text-brand">
          Não foi possível gerar a imagem.
        </span>
      )}
    </div>
  )
}
