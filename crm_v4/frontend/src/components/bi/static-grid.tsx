import type { CSSProperties } from 'react'
import type { AnyFieldRef, Visual } from '@/lib/bi/types'
import { VisualRenderer } from './visual-renderer'

export const ROW_HEIGHT = 72
export const GRID_GAP = 12

const byLayout = (a: Visual, b: Visual) => a.layout.y - b.layout.y || a.layout.x - b.layout.x

/**
 * Read-only grid on CSS grid: same 12 columns and row height as the editor from `md` up; below it
 * the visuals stack in one column in layout order (spec edge case "Tela pequena").
 */
export function StaticGrid({ visuals, pendingFields = {} }: { visuals: Visual[]; pendingFields?: Record<string, AnyFieldRef[]> }) {
  return (
    <div className="flex flex-col gap-3 md:grid md:grid-cols-12 md:auto-rows-[72px]">
      {[...visuals].sort(byLayout).map((visual) => {
        const { x, y, w, h } = visual.layout
        const style = { '--bi-col': `${x + 1} / span ${w}`, '--bi-row': `${y + 1} / span ${h}` } as CSSProperties
        return (
          <div key={visual.id} style={style} className="h-80 min-w-0 md:h-auto md:[grid-column:var(--bi-col)] md:[grid-row:var(--bi-row)]">
            <VisualRenderer visual={visual} pendingFields={pendingFields[visual.id]} />
          </div>
        )
      })}
    </div>
  )
}
