import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Db } from '../db/client.js'
import { leads, leadStageChanges } from '../db/schema.js'
import { createTestDb, insertLead } from '../test/db.js'
import * as pipelineModel from './pipeline.js'
import type { PipelineWithStages } from './pipeline.js'
import * as stageModel from './stage.js'
import * as userModel from './user.js'

let db: Db
let vendas: PipelineWithStages
const stage = (name: string) => vendas.stages.find((s) => s.name === name)!
const names = async (pipelineId = vendas.id) => (await pipelineModel.findById(db, pipelineId))!.stages.map((s) => s.name)

beforeEach(async () => {
  db = await createTestDb()
  vendas = (await pipelineModel.findEntry(db))!
})

describe('stage model', () => {
  it('appends a stage at the end, with unique trimmed names per pipeline', async () => {
    const created = await stageModel.create(db, vendas.id, { name: ' Onboarding ', color: 'teal' })
    expect(created).toMatchObject({ name: 'Onboarding', color: 'teal', kind: 'open', position: 5 })
    await expect(stageModel.create(db, vendas.id, { name: 'novo' })).rejects.toMatchObject({ code: 'STAGE_NAME_TAKEN', httpStatus: 409 })
    const other = await pipelineModel.create(db, 'Pós-venda')
    await expect(stageModel.create(db, other.id, { name: 'Onboarding' })).resolves.toBeTruthy()
  })

  it(`limits a pipeline to ${stageModel.STAGE_LIMIT} stages`, async () => {
    for (let i = 5; i < stageModel.STAGE_LIMIT; i++) await stageModel.create(db, vendas.id, { name: `Etapa ${i}` })
    await expect(stageModel.create(db, vendas.id, { name: 'Demais' })).rejects.toMatchObject({ code: 'STAGE_LIMIT', httpStatus: 409 })
  })

  it('updates name, color and kind', async () => {
    const updated = await stageModel.update(db, stage('Perdido').id, { name: 'Cancelado', color: 'red', kind: 'lost' })
    expect(updated).toMatchObject({ name: 'Cancelado', color: 'red', kind: 'lost' })
    await expect(stageModel.update(db, stage('Ganho').id, { name: 'Novo' })).rejects.toMatchObject({ code: 'STAGE_NAME_TAKEN' })
    expect(await stageModel.update(db, '00000000-0000-0000-0000-000000000000', { name: 'x' })).toBeNull()
  })

  it('reorders with the exact list of the pipeline stages', async () => {
    const order = ['Novo', 'Proposta', 'Em contato', 'Ganho', 'Perdido'].map((n) => stage(n).id)
    const reordered = await stageModel.reorder(db, vendas.id, order)
    expect(reordered.map((s) => [s.name, s.position])).toEqual([
      ['Novo', 0],
      ['Proposta', 1],
      ['Em contato', 2],
      ['Ganho', 3],
      ['Perdido', 4],
    ])
    await expect(stageModel.reorder(db, vendas.id, order.slice(1))).rejects.toMatchObject({ code: 'STAGE_ORDER_MISMATCH', httpStatus: 422 })
    await expect(stageModel.reorder(db, vendas.id, [...order.slice(1), order[1]!])).rejects.toMatchObject({ code: 'STAGE_ORDER_MISMATCH' })
  })

  it('deletes an empty stage and compacts positions, but never the last one', async () => {
    const result = await stageModel.remove(db, { stageId: stage('Proposta').id, userId: null })
    expect(result).toEqual({ pipelineId: vendas.id, relocated: [] })
    expect(await names()).toEqual(['Novo', 'Em contato', 'Ganho', 'Perdido'])
    expect((await pipelineModel.findById(db, vendas.id))!.stages.map((s) => s.position)).toEqual([0, 1, 2, 3])

    const solo = await pipelineModel.create(db, 'Solo')
    for (const s of solo.stages.slice(1)) await stageModel.remove(db, { stageId: s.id, userId: null })
    await expect(stageModel.remove(db, { stageId: solo.stages[0]!.id, userId: null })).rejects.toMatchObject({ code: 'LAST_STAGE' })
  })

  it('requires a destination for a stage with leads and relocates them with history', async () => {
    const admin = await userModel.create(db, { name: 'Ana', email: 'a@x.com', passwordHash: 'h', role: 'admin', status: 'active' })
    const existing = await insertLead(db, { pipelineId: vendas.id, stageId: stage('Em contato').id, position: 0 })
    const first = await insertLead(db, { pipelineId: vendas.id, stageId: stage('Novo').id, position: 0, valueCents: 900 })
    const second = await insertLead(db, { pipelineId: vendas.id, stageId: stage('Novo').id, position: 1024 })
    const other = await pipelineModel.create(db, 'Pós-venda')

    await expect(stageModel.remove(db, { stageId: stage('Novo').id, userId: admin.id })).rejects.toMatchObject({ code: 'STAGE_NOT_EMPTY', httpStatus: 409 })
    for (const moveToStageId of [stage('Novo').id, other.stages[0]!.id, '00000000-0000-0000-0000-000000000000']) {
      await expect(stageModel.remove(db, { stageId: stage('Novo').id, moveToStageId, userId: admin.id })).rejects.toMatchObject({
        code: 'INVALID_MOVE_TARGET',
        httpStatus: 422,
      })
    }

    const result = await stageModel.remove(db, { stageId: stage('Novo').id, moveToStageId: stage('Em contato').id, userId: admin.id })
    expect(result.relocated).toEqual([
      { leadId: first.lead.id, previous: { stageId: stage('Novo').id, valueCents: 900 } },
      { leadId: second.lead.id, previous: { stageId: stage('Novo').id, valueCents: null } },
    ])
    const column = await db.select().from(leads).where(eq(leads.stageId, stage('Em contato').id))
    expect(column.sort((a, b) => a.position - b.position).map((l) => l.id)).toEqual([existing.lead.id, first.lead.id, second.lead.id])

    const history = await db.select().from(leadStageChanges).where(eq(leadStageChanges.leadId, first.lead.id))
    expect(history).toEqual([
      expect.objectContaining({ fromStageId: null, fromStageName: 'Novo', toStageName: 'Em contato', changedById: admin.id }),
    ])
    expect(await names()).toEqual(['Em contato', 'Proposta', 'Ganho', 'Perdido'])
  })
})
