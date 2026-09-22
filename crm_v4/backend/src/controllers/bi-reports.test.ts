import { sql } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as datasetModel from '../models/bi/dataset.js'
import { emptyDefinition, type ReportDefinition } from '../models/bi/definition.js'
import * as reportModel from '../models/bi/report.js'
import type { User } from '../models/user.js'
import { fakeContext } from '../test/context.js'
import * as controller from './bi-reports.js'

vi.mock('../models/bi/report.js', async (importOriginal) => {
  const actual = await importOriginal<typeof reportModel>()
  return { ...Object.fromEntries(Object.keys(actual).map((key) => [key, vi.fn()])), canEdit: actual.canEdit }
})
vi.mock('../models/bi/dataset.js')

const user = (id: string, role: User['role'] = 'attendant'): User => ({
  id,
  name: id,
  email: `${id}@x.com`,
  role,
  status: 'active',
  createdAt: new Date(),
  updatedAt: new Date(),
})
const owner = user('owner')
const { ctx } = fakeContext()
const SRC = 'internal:whatsapp_messages'

const report = (overrides: Partial<reportModel.ReportWithNames> = {}): reportModel.ReportWithNames => ({
  id: 'r1',
  name: 'R',
  ownerId: 'owner',
  definition: emptyDefinition(),
  version: 3,
  updatedBy: 'owner',
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-02'),
  ownerName: 'Dona',
  updatedByName: 'Outra',
  ...overrides,
})

const withVisual = (field: string): ReportDefinition => ({
  calculatedFields: [],
  pages: [
    {
      id: 'p',
      name: 'P',
      filters: [],
      visuals: [{ id: 'v', type: 'kpi', layout: { x: 0, y: 0, w: 3, h: 2 }, sourceId: SRC, slots: { value: [{ sourceId: SRC, field }] }, options: { limit: 20, crossFilter: true } }],
    },
  ],
})

beforeEach(() => {
  vi.mocked(reportModel.reportPermission).mockResolvedValue('owner')
  vi.mocked(reportModel.getReport).mockResolvedValue(report())
  vi.mocked(reportModel.createReport).mockResolvedValue(report())
  vi.mocked(reportModel.saveReport).mockResolvedValue(report({ version: 4 }))
  vi.mocked(datasetModel.datasetFor).mockResolvedValue({
    sourceId: SRC,
    name: 'Mensagens',
    fields: [{ key: 'mensagem', label: 'Mensagem', type: 'text', detectedType: 'text', invalidCount: 0, expr: sql`1` }],
    from: sql``,
    dataAsOf: null,
    lastError: null,
    lastAttemptAt: null,
  })
})

describe('bi-reports controller', () => {
  it('creates an empty report, or one from a template', async () => {
    await controller.createReport(ctx, owner, { name: 'Novo' })
    expect(reportModel.createReport).toHaveBeenCalledWith(ctx.db, { name: 'Novo', ownerId: 'owner', definition: emptyDefinition() })
    await controller.createReport(ctx, owner, { name: 'Atendimento', templateId: 'whatsapp_attendance' })
    const definition = vi.mocked(reportModel.createReport).mock.calls[1]![1].definition
    expect(definition.pages[0]!.visuals.length).toBeGreaterThan(3)
  })

  it('duplicates a report the user can see', async () => {
    vi.mocked(reportModel.reportPermission).mockResolvedValueOnce('view')
    vi.mocked(reportModel.getReport).mockResolvedValueOnce(report({ definition: withVisual('mensagem') }))
    await controller.createReport(ctx, owner, { name: 'Cópia', duplicateOf: 'r1' })
    expect(vi.mocked(reportModel.createReport).mock.calls[0]![1]).toMatchObject({ ownerId: 'owner', definition: withVisual('mensagem') })
  })

  it('hides reports the user cannot access', async () => {
    vi.mocked(reportModel.reportPermission).mockResolvedValue(null)
    await expect(controller.getReport(ctx, owner, 'r1')).rejects.toMatchObject({ httpStatus: 404 })
  })

  it('returns the report with the viewer permission', async () => {
    vi.mocked(reportModel.reportPermission).mockResolvedValue('view')
    expect(await controller.getReport(ctx, owner, 'r1')).toMatchObject({ id: 'r1', permission: 'view', version: 3, updatedAt: '2026-01-02T00:00:00.000Z' })
  })

  it('saves with the expected version after validating fields', async () => {
    await controller.saveReport(ctx, owner, 'r1', { name: 'R', definition: withVisual('mensagem'), version: 3 })
    expect(reportModel.saveReport).toHaveBeenCalledWith(ctx.db, 'r1', expect.objectContaining({ expectedVersion: 3, userId: 'owner' }))
  })

  it('rejects unknown fields and invalid expressions', async () => {
    await expect(controller.saveReport(ctx, owner, 'r1', { name: 'R', definition: withVisual('nope'), version: 3 })).rejects.toMatchObject({ code: 'UNKNOWN_FIELD' })
    const bad = { ...emptyDefinition(), calculatedFields: [{ id: 'c', name: 'C', expression: 'SUM(', sourceId: SRC }] }
    await expect(controller.saveReport(ctx, owner, 'r1', { name: 'R', definition: bad, version: 3 })).rejects.toMatchObject({ code: 'INVALID_EXPRESSION' })
  })

  it('reports a conflict with who saved last, and overwrites when forced', async () => {
    vi.mocked(reportModel.saveReport).mockResolvedValueOnce(null)
    await expect(controller.saveReport(ctx, owner, 'r1', { name: 'R', definition: emptyDefinition(), version: 2 })).rejects.toMatchObject({
      code: 'REPORT_CONFLICT',
      httpStatus: 409,
      details: { version: 3, updatedByName: 'Outra', updatedAt: '2026-01-02T00:00:00.000Z' },
    })
    await controller.saveReport(ctx, owner, 'r1', { name: 'R', definition: emptyDefinition(), version: 2, force: true })
    expect(vi.mocked(reportModel.saveReport).mock.calls[1]![2]).toMatchObject({ expectedVersion: null })
  })

  it('does not let viewers save or anyone but the owner/admin delete and share', async () => {
    vi.mocked(reportModel.reportPermission).mockResolvedValue('view')
    await expect(controller.saveReport(ctx, owner, 'r1', { name: 'R', definition: emptyDefinition(), version: 3 })).rejects.toMatchObject({ httpStatus: 403 })
    vi.mocked(reportModel.reportPermission).mockResolvedValue('edit')
    await expect(controller.deleteReport(ctx, owner, 'r1')).rejects.toMatchObject({ httpStatus: 403 })
    await expect(controller.replaceShares(ctx, owner, 'r1', [])).rejects.toMatchObject({ httpStatus: 403 })
    await expect(controller.deleteReport(ctx, user('boss', 'admin'), 'r1')).resolves.toBeUndefined()
  })

  it('shares only with active users other than the owner', async () => {
    vi.mocked(reportModel.activeUserIds).mockResolvedValue(['a'])
    vi.mocked(reportModel.listShares).mockResolvedValue([])
    await controller.replaceShares(ctx, owner, 'r1', [{ userId: 'owner', permission: 'edit' }, { userId: 'a', permission: 'view' }])
    expect(reportModel.replaceShares).toHaveBeenCalledWith(ctx.db, 'r1', [{ userId: 'a', permission: 'view' }])
    vi.mocked(reportModel.activeUserIds).mockResolvedValue([])
    await expect(controller.replaceShares(ctx, owner, 'r1', [{ userId: 'x', permission: 'view' }])).rejects.toMatchObject({ httpStatus: 422 })
  })
})
