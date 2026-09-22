import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Db } from '../db/client.js'
import { biSnapshotRows, biSources } from '../db/schema-bi.js'
import type { BiConnectors } from '../integrations/bi-connectors/index.js'
import { DomainError } from '../lib/errors.js'
import { emptyDefinition } from '../models/bi/definition.js'
import { createReport } from '../models/bi/report.js'
import * as sourceModel from '../models/bi/source.js'
import type { User } from '../models/user.js'
import { createTestDb } from '../test/db.js'
import { seedUser } from '../test/bi-fixtures.js'
import { fakeContext, testConfig } from '../test/context.js'
import { runDueRefreshes, startRefresh } from './bi-ingest.js'
import * as controller from './bi-sources.js'

const KEY = Buffer.alloc(32, 7).toString('base64')
let db: Db
let admin: User
let rows: Record<string, unknown>[]
let connectors: { read: ReturnType<typeof vi.fn>; listSheets: ReturnType<typeof vi.fn> }

async function* yieldRows(list: Record<string, unknown>[]) {
  for (const row of list) yield row
}

const context = () =>
  fakeContext({ db, config: { ...testConfig, BI_SECRETS_KEY: KEY } as typeof testConfig, biConnectors: connectors as unknown as BiConnectors } as never)

const apiInput = (overrides: Partial<controller.SourceInput> = {}): controller.SourceInput => ({
  name: 'Vendas',
  kind: 'api',
  config: { url: 'https://api.test/vendas', method: 'GET', headers: [], query: [] },
  secrets: { headers: [{ name: 'Authorization', value: 'Bearer segredo-1234' }] },
  ...overrides,
})

async function waitForRefresh(sourceId: string) {
  for (let i = 0; i < 100; i++) {
    const source = await sourceModel.getSource(db, sourceId)
    if (source && !source.isRefreshing) return source
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  throw new Error('refresh did not finish')
}

beforeEach(async () => {
  db = await createTestDb()
  admin = { ...(await seedUser(db, 'Admin', 'admin')), role: 'admin' }
  // 20 valid values and one invalid: within the 95% type-detection threshold.
  rows = [
    { vendedor: 'Ana', valor: 'R$ 10,00', data: '05/01/2026' },
    ...Array.from({ length: 19 }, (_, i) => ({ vendedor: `V${i}`, valor: `R$ ${i + 1},00`, data: '06/01/2026' })),
    { vendedor: 'Bruno', valor: 'n/d', data: '06/01/2026' },
  ]
  connectors = { read: vi.fn(() => yieldRows(rows)), listSheets: vi.fn().mockResolvedValue(['Plan1']) }
}, 60_000)

describe('bi-sources controller', () => {
  it('only lets admins manage sources', async () => {
    const { ctx } = context()
    const attendant = { ...admin, role: 'attendant' as const }
    await expect(controller.createSource(ctx, attendant, apiInput())).rejects.toMatchObject({ httpStatus: 403 })
    await expect(controller.previewSource(ctx, attendant, apiInput())).rejects.toMatchObject({ httpStatus: 403 })
  })

  it('previews normalized rows and detected types without saving', async () => {
    const { ctx } = context()
    const preview = await controller.previewSource(ctx, admin, apiInput())
    expect(preview.fields.map((field) => [field.key, field.type, field.invalidCount])).toEqual([
      ['vendedor', 'text', 0],
      ['valor', 'currency', 1],
      ['data', 'date', 0],
    ])
    expect(preview.rows[0]).toEqual(['Ana', 10, '2026-01-05T03:00:00.000Z'])
    expect(await db.select().from(biSources)).toEqual([])
  })

  it('validates the configuration of each kind', async () => {
    const { ctx } = context()
    await expect(controller.previewSource(ctx, admin, apiInput({ config: { url: 'ftp://x' } }))).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
    const file = apiInput({ kind: 'spreadsheet_file', config: { storagePath: 'x', originalFilename: 'a.csv', headerRow: 1 }, secrets: {}, refreshInterval: '1h' })
    await expect(controller.createSource(ctx, admin, file)).rejects.toMatchObject({ message: expect.stringContaining('manualmente') })
  })

  it('creates a source with encrypted secrets, captures it and only shows masked secrets', async () => {
    const { ctx } = context()
    const created = await controller.createSource(ctx, admin, apiInput())
    const [row] = await db.select().from(biSources).where(eq(biSources.id, created.id))
    expect(row!.secretsEncrypted).not.toContain('segredo')
    const done = await waitForRefresh(created.id)
    expect(done).toMatchObject({ rowCount: 21, lastError: null })
    expect(done.fields.find((field) => field.key === 'valor')).toMatchObject({ type: 'currency', invalidCount: 1 })
    const dto = await controller.getSource(ctx, admin, created.id)
    expect(dto.maskedSecrets).toEqual({ headers: [{ name: 'Authorization', value: '••••1234' }] })
    expect(JSON.stringify(dto)).not.toContain('segredo')
    const attendantView = await controller.getSource(ctx, { ...admin, role: 'attendant' }, created.id)
    expect(attendantView.config).toBeUndefined()
  })

  it('keeps saved secrets when an update leaves them blank and refreshes on config changes', async () => {
    const { ctx } = context()
    const created = await controller.createSource(ctx, admin, apiInput())
    await waitForRefresh(created.id)
    await controller.updateSource(ctx, admin, created.id, { secrets: { headers: [{ name: 'Authorization', value: '' }] }, config: { ...apiInput().config, itemsPath: 'data' } })
    await waitForRefresh(created.id)
    expect(connectors.read).toHaveBeenLastCalledWith('api', expect.objectContaining({ itemsPath: 'data' }), { headers: [{ name: 'Authorization', value: 'Bearer segredo-1234' }] })
  })

  it('applies type and label corrections made in the preview to the first capture', async () => {
    const { ctx } = context()
    const created = await controller.createSource(ctx, admin, { ...apiInput(), fieldTypes: { valor: 'text' }, fieldLabels: { valor: 'Valor bruto' } })
    const source = await waitForRefresh(created.id)
    expect(source.fields.find((field) => field.key === 'valor')).toMatchObject({ type: 'text', label: 'Valor bruto', detectedType: 'currency' })
  })

  it('reprocesses with a corrected field type', async () => {
    const { ctx } = context()
    const created = await controller.createSource(ctx, admin, apiInput())
    await waitForRefresh(created.id)
    await controller.updateSource(ctx, admin, created.id, { fieldTypes: { valor: 'text' }, fieldLabels: { valor: 'Valor (R$)' } })
    const source = await waitForRefresh(created.id)
    expect(source.fields.find((field) => field.key === 'valor')).toMatchObject({ type: 'text', label: 'Valor (R$)', detectedType: 'currency', invalidCount: 0 })
    const stored = await db.select().from(biSnapshotRows)
    expect(stored.map((row) => row.data.valor)).toContain('n/d')
    expect(stored.map((row) => row.data.valor)).toContain('R$ 10,00')
  })

  it('keeps the last data and records the error when a refresh fails', async () => {
    const { ctx } = context()
    const created = await controller.createSource(ctx, admin, apiInput())
    await waitForRefresh(created.id)
    connectors.read.mockImplementation(async function* () {
      yield* []
      throw new DomainError('CONNECTION_FAILED', 'A API não respondeu.', 422)
    })
    await controller.refreshSource(ctx, admin, created.id)
    const source = await waitForRefresh(created.id)
    expect(source).toMatchObject({ rowCount: 21, lastError: 'A API não respondeu.' })
  })

  it('blocks deleting a source used by reports and lists them', async () => {
    const { ctx } = context()
    const created = await controller.createSource(ctx, admin, apiInput())
    await waitForRefresh(created.id)
    const definition = emptyDefinition()
    definition.pages[0]!.visuals.push({ id: 'v', type: 'kpi', layout: { x: 0, y: 0, w: 3, h: 2 }, sourceId: created.id, slots: {}, options: { limit: 20, crossFilter: true } })
    await createReport(db, { name: 'Painel', ownerId: admin.id, definition })
    await expect(controller.deleteSource(ctx, admin, created.id)).rejects.toMatchObject({ code: 'SOURCE_IN_USE', httpStatus: 409, details: { reports: [{ name: 'Painel' }] } })
  })

  it('uploads spreadsheets to storage and lists xlsx sheets', async () => {
    const { ctx, storage } = context()
    const result = await controller.uploadSpreadsheet(ctx, admin, { filename: 'Vendas 2026.xlsx', mimetype: 'application/vnd.ms-excel', data: Buffer.from('x') })
    expect(result).toMatchObject({ originalFilename: 'Vendas 2026.xlsx', sheets: ['Plan1'] })
    expect(result.storagePath).toMatch(/^bi\/[0-9a-f-]+\/Vendas_2026\.xlsx$/)
    expect(storage.put).toHaveBeenCalled()
    await expect(controller.uploadSpreadsheet(ctx, admin, { filename: 'x.pdf', mimetype: 'application/pdf', data: Buffer.from('x') })).rejects.toMatchObject({ httpStatus: 415 })
  })

  it('relates fields of compatible types only', async () => {
    const { ctx } = context()
    const created = await controller.createSource(ctx, admin, apiInput())
    await waitForRefresh(created.id)
    const ok = await controller.createRelationship(ctx, admin, { leftSourceId: created.id, leftField: 'vendedor', rightSourceId: 'internal:whatsapp_messages', rightField: 'atendente' })
    expect(await controller.listRelationships(ctx)).toEqual([ok])
    await expect(
      controller.createRelationship(ctx, admin, { leftSourceId: created.id, leftField: 'valor', rightSourceId: 'internal:whatsapp_messages', rightField: 'atendente' }),
    ).rejects.toMatchObject({ code: 'INCOMPATIBLE_FIELDS' })
  })

  it('merges and masks secrets', () => {
    expect(controller.mergeSecrets({ password: 'antiga' }, { password: '' })).toEqual({ password: 'antiga' })
    expect(controller.mergeSecrets({ password: 'antiga' }, { password: 'nova' })).toEqual({ password: 'nova' })
    expect(controller.maskSecrets({ password: 'supersecreta99' })).toEqual({ password: '••••ta99' })
  })
})

describe('refresh scheduling', () => {
  it('runs due sources and does not start a second refresh while one runs', async () => {
    const { ctx } = context()
    const created = await controller.createSource(ctx, admin, apiInput({ refreshInterval: '15m' }))
    await waitForRefresh(created.id)
    await runDueRefreshes(ctx, new Date(Date.now() + 16 * 60_000))
    expect(connectors.read).toHaveBeenCalledTimes(2)
    const source = (await sourceModel.getSource(db, created.id))!
    await startRefresh(ctx, source)
    await expect(startRefresh(ctx, source)).rejects.toMatchObject({ code: 'REFRESH_IN_PROGRESS' })
  })
})
