// API shapes for feature 004 (contracts/openapi.yaml of specs/004-interactive-bi-reports).
import type { BiRelationshipRow } from '../db/schema-bi.js'
import type { SourceField } from '../models/bi/definition.js'
import type { InternalSource } from '../models/bi/internal-sources.js'
import type { ReportPermission, ReportSummary, ReportWithNames } from '../models/bi/report.js'
import type { SourceWithStatus } from '../models/bi/source.js'

export interface SourceDto {
  id: string
  name: string
  kind: SourceWithStatus['kind'] | 'internal'
  fields: SourceField[]
  refreshInterval: SourceWithStatus['refreshInterval']
  rowCount: number | null
  lastRefreshedAt: string | null
  lastAttemptAt: string | null
  lastError: string | null
  isRefreshing: boolean
  config?: Record<string, unknown>
  maskedSecrets?: Record<string, unknown>
}

const iso = (date: Date | null) => (date ? date.toISOString() : null)

export function toInternalSourceDto(source: InternalSource): SourceDto {
  return {
    id: source.id,
    name: source.name,
    kind: 'internal',
    fields: source.fields.map(({ expr: _expr, ...field }) => field),
    refreshInterval: 'manual',
    rowCount: null,
    lastRefreshedAt: null,
    lastAttemptAt: null,
    lastError: null,
    isRefreshing: false,
  }
}

/** Admin-only extras (configuration, masked secrets) are passed in explicitly. */
export function toSourceDto(source: SourceWithStatus, adminView?: { maskedSecrets: Record<string, unknown> }): SourceDto {
  return {
    id: source.id,
    name: source.name,
    kind: source.kind,
    fields: source.fields,
    refreshInterval: source.refreshInterval,
    rowCount: source.rowCount,
    lastRefreshedAt: iso(source.lastRefreshedAt),
    lastAttemptAt: iso(source.lastAttemptAt),
    lastError: source.lastError,
    isRefreshing: source.isRefreshing,
    ...(adminView ? { config: source.config, maskedSecrets: adminView.maskedSecrets } : {}),
  }
}

export const toRelationshipDto = ({ createdAt: _createdAt, ...row }: BiRelationshipRow) => row

export const toReportSummaryDto = (summary: ReportSummary) => ({ ...summary, updatedAt: summary.updatedAt.toISOString() })

export function toReportDto(report: ReportWithNames, permission: ReportPermission) {
  return {
    id: report.id,
    name: report.name,
    ownerName: report.ownerName,
    permission,
    updatedAt: report.updatedAt.toISOString(),
    definition: report.definition,
    version: report.version,
  }
}
