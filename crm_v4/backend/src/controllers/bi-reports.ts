import type { AppContext } from '../context.js'
import { DomainError, forbidden, notFound } from '../lib/errors.js'
import { datasetFor } from '../models/bi/dataset.js'
import { CALCULATED_PREFIX, emptyDefinition, type ReportDefinition } from '../models/bi/definition.js'
import { parseExpression } from '../models/bi/expression.js'
import * as reports from '../models/bi/report.js'
import { templateDefinition, type TemplateId } from '../models/bi/templates.js'
import type { User } from '../models/user.js'
import { toReportDto, toReportSummaryDto } from './bi-dto.js'

const reportNotFound = () => notFound('Relatório não encontrado.')

/** DomainError carrying extra data for the client (the error handler sends `details`). */
export const withDetails = (error: DomainError, details: unknown) => Object.assign(error, { details })

async function permissionOrNotFound(ctx: AppContext, user: User, reportId: string) {
  const permission = await reports.reportPermission(ctx.db, user, reportId)
  // No access looks the same as not existing, so report ids do not leak.
  if (!permission) throw reportNotFound()
  return permission
}

async function requireEdit(ctx: AppContext, user: User, reportId: string) {
  const permission = await permissionOrNotFound(ctx, user, reportId)
  if (!reports.canEdit(permission)) throw forbidden('Você só pode visualizar este relatório.')
  return permission
}

async function requireOwner(ctx: AppContext, user: User, reportId: string) {
  const permission = await permissionOrNotFound(ctx, user, reportId)
  if (permission !== 'owner' && user.role !== 'admin') throw forbidden('Só o dono do relatório pode fazer isso.')
}

function referencedFields(definition: ReportDefinition) {
  return definition.pages.flatMap((page) => [
    ...page.filters,
    ...page.visuals.flatMap((visual) => [
      ...(visual.slots.category ?? []),
      ...(visual.slots.value ?? []),
      ...(visual.slots.legend ? [visual.slots.legend] : []),
      ...(visual.slots.columns ? [visual.slots.columns] : []),
    ]),
  ])
}

/** Every source must exist, every field must exist in it and every expression must parse. */
async function validateReferences(ctx: AppContext, definition: ReportDefinition) {
  const sourceIds = new Set([
    ...definition.pages.flatMap((page) => page.visuals.flatMap((visual) => (visual.sourceId ? [visual.sourceId] : []))),
    ...referencedFields(definition).map((ref) => ref.sourceId),
    ...definition.calculatedFields.map((calc) => calc.sourceId),
  ])
  const fieldsBySource = new Map<string, Set<string>>()
  for (const sourceId of sourceIds) {
    const dataset = await datasetFor(ctx.db, sourceId)
    fieldsBySource.set(sourceId, new Set(dataset.fields.map((field) => field.key)))
  }
  const calcIds = new Set(definition.calculatedFields.map((calc) => `${CALCULATED_PREFIX}${calc.id}`))
  for (const ref of referencedFields(definition)) {
    const exists = ref.field.startsWith(CALCULATED_PREFIX) ? calcIds.has(ref.field) : fieldsBySource.get(ref.sourceId)?.has(ref.field)
    if (!exists) throw new DomainError('UNKNOWN_FIELD', `O campo "${ref.field}" não existe na fonte de dados.`, 422)
  }
  for (const calc of definition.calculatedFields) parseExpression(calc.expression)
}

export async function listReports(ctx: AppContext, user: User) {
  return (await reports.listReportsForUser(ctx.db, user)).map(toReportSummaryDto)
}

export async function getReport(ctx: AppContext, user: User, reportId: string) {
  const permission = await permissionOrNotFound(ctx, user, reportId)
  const report = await reports.getReport(ctx.db, reportId)
  if (!report) throw reportNotFound()
  return toReportDto(report, permission)
}

export async function createReport(ctx: AppContext, user: User, input: { name: string; templateId?: TemplateId; duplicateOf?: string }) {
  let definition = input.templateId ? templateDefinition(input.templateId) : emptyDefinition()
  if (input.duplicateOf) {
    await permissionOrNotFound(ctx, user, input.duplicateOf)
    definition = (await reports.getReport(ctx.db, input.duplicateOf))!.definition
  }
  const created = await reports.createReport(ctx.db, { name: input.name, ownerId: user.id, definition })
  return getReport(ctx, user, created.id)
}

export async function saveReport(
  ctx: AppContext,
  user: User,
  reportId: string,
  input: { name: string; definition: ReportDefinition; version: number; force?: boolean },
) {
  await requireEdit(ctx, user, reportId)
  await validateReferences(ctx, input.definition)
  const saved = await reports.saveReport(ctx.db, reportId, {
    name: input.name,
    definition: input.definition,
    expectedVersion: input.force ? null : input.version,
    userId: user.id,
  })
  if (!saved) {
    const current = (await reports.getReport(ctx.db, reportId))!
    throw withDetails(
      new DomainError('REPORT_CONFLICT', 'Outra pessoa salvou este relatório enquanto você editava.', 409),
      { version: current.version, updatedAt: current.updatedAt.toISOString(), updatedByName: current.updatedByName },
    )
  }
  return getReport(ctx, user, reportId)
}

export async function deleteReport(ctx: AppContext, user: User, reportId: string) {
  await requireOwner(ctx, user, reportId)
  await reports.deleteReport(ctx.db, reportId)
}

export async function listShares(ctx: AppContext, user: User, reportId: string) {
  await requireOwner(ctx, user, reportId)
  return reports.listShares(ctx.db, reportId)
}

export async function replaceShares(ctx: AppContext, user: User, reportId: string, shares: { userId: string; permission: 'edit' | 'view' }[]) {
  await requireOwner(ctx, user, reportId)
  const report = (await reports.getReport(ctx.db, reportId))!
  const targets = shares.filter((share) => share.userId !== report.ownerId)
  const active = new Set(await reports.activeUserIds(ctx.db, targets.map((share) => share.userId)))
  if (targets.some((share) => !active.has(share.userId))) {
    throw new DomainError('VALIDATION_ERROR', 'Só é possível compartilhar com usuários ativos.', 422)
  }
  await reports.replaceShares(ctx.db, reportId, targets)
  return reports.listShares(ctx.db, reportId)
}
