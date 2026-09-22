import type { QueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'
import { suggestVisualForField } from '@/lib/bi/slots'
import type { QueryRequest, QueryResult, VisualLayout } from '@/lib/bi/types'
import { biKeys } from '@/lib/bi/use-bi'
import type { BiEditorAction } from './editor-actions'
import type { FieldPayload } from './field-meta'

const DISTINCT_PROBE_LIMIT = 7 // one more than the donut threshold (≤ 6 values)

/** Distinct values of a text/boolean field, capped at 7: enough to choose donut or bar. */
async function distinctCount(client: QueryClient, field: FieldPayload) {
  if (field.type !== 'text' && field.type !== 'boolean') return undefined
  const ref = { sourceId: field.sourceId, field: field.field }
  const request: QueryRequest = {
    sourceId: field.sourceId,
    dimensions: [ref],
    measures: [{ ...ref, aggregation: 'count' }],
    filters: [],
    calculatedFields: [],
    limit: DISTINCT_PROBE_LIMIT,
    groupOthers: false,
  }
  try {
    const result = await client.fetchQuery({ queryKey: biKeys.query(request), queryFn: () => apiFetch<QueryResult>('/api/bi/query', { method: 'POST', json: request }) })
    return result.rows.length
  } catch {
    return undefined // no count: fall back to the bar suggestion
  }
}

/** `addVisual` for a field dropped on the empty canvas (or "Novo componente" in its menu), FR-011. */
export async function suggestedVisualAction(client: QueryClient, field: FieldPayload, layout?: Partial<VisualLayout>): Promise<BiEditorAction> {
  const suggestion = suggestVisualForField(field, field.type, await distinctCount(client, field))
  return { type: 'addVisual', visualType: suggestion.type, sourceId: field.sourceId, slots: suggestion.slots, options: suggestion.options, layout }
}
