import type { ReportDefinition, ReportPage, Visual } from './types'

/** Test fixture: a visual with sane defaults. */
export function makeVisual(partial: Partial<Visual> = {}): Visual {
  return {
    id: 'v1',
    type: 'bar',
    layout: { x: 0, y: 0, w: 6, h: 4 },
    sourceId: 'internal:messages',
    slots: {},
    options: { limit: 20, crossFilter: true },
    ...partial,
  }
}

export function makePage(partial: Partial<ReportPage> = {}): ReportPage {
  return { id: 'p1', name: 'Página 1', filters: [], visuals: [], ...partial }
}

export function makeDefinition(partial: Partial<ReportDefinition> = {}): ReportDefinition {
  return { pages: [makePage()], calculatedFields: [], ...partial }
}
