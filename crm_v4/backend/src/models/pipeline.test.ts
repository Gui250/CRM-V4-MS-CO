import { beforeEach, describe, expect, it } from 'vitest'
import type { Db } from '../db/client.js'
import { pipelines } from '../db/schema.js'
import { createTestDb } from '../test/db.js'
import * as pipelineModel from './pipeline.js'

let db: Db
beforeEach(async () => {
  db = await createTestDb()
})

describe('pipeline model: reads', () => {
  it('lists the seeded "Vendas" pipeline with its stages in order', async () => {
    const [vendas, ...rest] = await pipelineModel.list(db, { includeArchived: false })
    expect(rest).toHaveLength(0)
    expect(vendas).toMatchObject({ name: 'Vendas', isEntry: true, archivedAt: null })
    expect(vendas!.stages.map((stage) => [stage.name, stage.kind])).toEqual([
      ['Novo', 'open'],
      ['Em contato', 'open'],
      ['Proposta', 'open'],
      ['Ganho', 'won'],
      ['Perdido', 'lost'],
    ])
  })

  it('hides archived pipelines unless asked', async () => {
    await db.insert(pipelines).values({ name: 'Antigo', archivedAt: new Date() })
    expect((await pipelineModel.list(db, { includeArchived: false })).map((p) => p.name)).toEqual(['Vendas'])
    expect((await pipelineModel.list(db, { includeArchived: true })).map((p) => p.name)).toEqual(['Antigo', 'Vendas'])
  })

  it('finds by id and finds the entry pipeline', async () => {
    const entry = await pipelineModel.findEntry(db)
    expect(entry?.name).toBe('Vendas')
    expect((await pipelineModel.findById(db, entry!.id))?.stages).toHaveLength(5)
    expect(await pipelineModel.findById(db, '00000000-0000-0000-0000-000000000000')).toBeNull()

    await db.update(pipelines).set({ isEntry: false })
    expect(await pipelineModel.findEntry(db)).toBeNull()
  })
})

describe('pipeline model: writes (US3)', () => {
  it('creates a pipeline with the default stages, trimming the name', async () => {
    const created = await pipelineModel.create(db, '  Pós-venda ')
    expect(created).toMatchObject({ name: 'Pós-venda', isEntry: false, archivedAt: null })
    expect(created.stages.map((s) => [s.name, s.kind, s.color, s.position])).toEqual(
      pipelineModel.DEFAULT_STAGES.map((s, i) => [s.name, s.kind, s.color, i]),
    )
  })

  it('refuses a name taken by an active pipeline, case-insensitively, but not by an archived one', async () => {
    await expect(pipelineModel.create(db, 'vendas')).rejects.toMatchObject({ code: 'PIPELINE_NAME_TAKEN', httpStatus: 409 })
    const old = await pipelineModel.create(db, 'Recrutamento')
    await pipelineModel.update(db, old.id, { archived: true })
    await expect(pipelineModel.create(db, 'Recrutamento')).resolves.toMatchObject({ name: 'Recrutamento' })
    await expect(pipelineModel.update(db, old.id, { archived: false })).rejects.toMatchObject({ code: 'PIPELINE_NAME_TAKEN' })
  })

  it('keeps a single entry pipeline and clears it when archiving', async () => {
    const vendas = (await pipelineModel.findEntry(db))!
    const pos = await pipelineModel.create(db, 'Pós-venda')

    await pipelineModel.update(db, pos.id, { isEntry: true })
    expect((await pipelineModel.findEntry(db))?.id).toBe(pos.id)
    expect((await pipelineModel.findById(db, vendas.id))?.isEntry).toBe(false)

    const archived = await pipelineModel.update(db, pos.id, { archived: true })
    expect(archived).toMatchObject({ isEntry: false, archivedAt: expect.any(Date) })
    expect(await pipelineModel.findEntry(db)).toBeNull()
    await expect(pipelineModel.update(db, pos.id, { isEntry: true })).rejects.toMatchObject({ code: 'PIPELINE_ARCHIVED' })

    const reactivated = await pipelineModel.update(db, pos.id, { archived: false, name: 'Pós-venda 2' })
    expect(reactivated).toMatchObject({ archivedAt: null, name: 'Pós-venda 2' })
    expect(await pipelineModel.update(db, '00000000-0000-0000-0000-000000000000', { name: 'x' })).toBeNull()
  })
})
