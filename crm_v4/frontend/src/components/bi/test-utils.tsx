import type { Mock } from 'vitest'
import { makeDefinition } from '@/lib/bi/test-helpers'
import type { FieldType, QueryRequest, QueryResult, Report, Source, SourceField } from '@/lib/bi/types'
import { mockApi } from '@/test/render'

// Shared fixtures for components/bi tests.

const field = (key: string, label: string, type: FieldType): SourceField => ({ key, label, type, detectedType: type, invalidCount: 0 })

export const SOURCE_ID = 'internal:messages'

export const messagesSource: Source = {
  id: SOURCE_ID,
  name: 'Mensagens',
  kind: 'internal',
  refreshInterval: 'manual',
  lastRefreshedAt: null,
  lastAttemptAt: null,
  lastError: null,
  isRefreshing: false,
  fields: [field('agent', 'Atendente', 'text'), field('sent_at', 'Enviada em', 'datetime'), field('value', 'Valor', 'currency'), field('status', 'Status', 'text')],
}

export function makeReport(partial: Partial<Report> = {}): Report {
  return {
    id: 'r1',
    name: 'Atendimento',
    ownerName: 'Ana',
    permission: 'owner',
    updatedAt: '2026-09-22T12:00:00.000Z',
    version: 3,
    definition: makeDefinition(),
    ...partial,
  }
}

/** Plausible answer for any query: two groups per dimension set, or a single total. */
export function fakeResult(request: QueryRequest): QueryResult {
  const columns = [
    ...request.dimensions.map((d) => ({ key: d.field, label: d.field, type: 'text' as const })),
    ...request.measures.map((m) => ({ key: m.field, label: m.field, type: 'number' as const })),
  ]
  const rows = request.dimensions.length ? [['Ana', ...request.measures.map(() => 5)], ['Bia', ...request.measures.map(() => 3)]] : [request.measures.map(() => 8)]
  return { columns, rows, dataAsOf: '2026-09-22T12:00:00.000Z', staleWarning: null, missingFields: [] }
}

type Routes = Parameters<typeof mockApi>[0]

/** Sources, relationships and queries answered; extra routes override. */
export function mockBiApi(routes: Routes = {}) {
  return mockApi({
    'GET /api/bi/sources': () => ({ body: [messagesSource] }),
    'GET /api/bi/relationships': () => ({ body: [] }),
    'POST /api/bi/query': (init) => ({ body: fakeResult(JSON.parse(String(init?.body)) as QueryRequest) }),
    ...routes,
  })
}

/** JSON bodies sent to "METHOD /path", in call order. */
export function bodiesOf(fetchMock: Mock, key: string): unknown[] {
  return fetchMock.mock.calls
    .filter(([input, init]) => `${(init as RequestInit | undefined)?.method ?? 'GET'} ${new URL(String(input), 'http://localhost').pathname}` === key)
    .map(([, init]) => JSON.parse(String((init as RequestInit).body)))
}

/** Stand-in for the ECharts wrapper: exposes the name, the option and a click on the first point. */
export function FakeEChart({ ariaLabel, option, onItemClick }: { ariaLabel: string; option: unknown; onItemClick?: (p: { dataIndex: number }) => void }) {
  return <div role="img" aria-label={ariaLabel} data-option={JSON.stringify(option)} onClick={() => onItemClick?.({ dataIndex: 0 })} />
}
