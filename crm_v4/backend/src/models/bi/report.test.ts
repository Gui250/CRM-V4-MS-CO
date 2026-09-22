import { beforeEach, describe, expect, it } from 'vitest'
import type { Db } from '../../db/client.js'
import { users } from '../../db/schema.js'
import { createTestDb } from '../../test/db.js'
import { seedUser } from '../../test/bi-fixtures.js'
import { emptyDefinition, type ReportDefinition } from './definition.js'
import * as model from './report.js'

let db: Db
let owner: { id: string; role: 'admin' | 'attendant' }
let other: { id: string; role: 'admin' | 'attendant' }
let admin: { id: string; role: 'admin' | 'attendant' }

beforeEach(async () => {
  db = await createTestDb()
  owner = await seedUser(db, 'Dona')
  other = await seedUser(db, 'Outra')
  admin = await seedUser(db, 'Chefe', 'admin')
})

const withSource = (sourceId: string): ReportDefinition => ({
  ...emptyDefinition(),
  pages: [{ id: 'p1', name: 'P', filters: [], visuals: [{ id: 'v', type: 'kpi', layout: { x: 0, y: 0, w: 3, h: 2 }, sourceId, slots: {}, options: { limit: 20, crossFilter: true } }] }],
})

describe('report model', () => {
  it('creates a report at version 1 and reads it with owner and updater names', async () => {
    const created = await model.createReport(db, { name: 'Atendimento', ownerId: owner.id, definition: emptyDefinition() })
    expect(created.version).toBe(1)
    expect(await model.getReport(db, created.id)).toMatchObject({ name: 'Atendimento', ownerName: 'Dona', updatedByName: 'Dona' })
    expect(await model.getReport(db, '00000000-0000-0000-0000-000000000000')).toBeNull()
  })

  it('enforces a name between 1 and 100 characters', async () => {
    await expect(model.createReport(db, { name: '', ownerId: owner.id, definition: emptyDefinition() })).rejects.toThrow()
    await expect(model.createReport(db, { name: 'x'.repeat(101), ownerId: owner.id, definition: emptyDefinition() })).rejects.toThrow()
  })

  it('saves only when the expected version matches, and always when forced', async () => {
    const created = await model.createReport(db, { name: 'R', ownerId: owner.id, definition: emptyDefinition() })
    const saved = await model.saveReport(db, created.id, { name: 'R2', definition: emptyDefinition(), expectedVersion: 1, userId: other.id })
    expect(saved).toMatchObject({ name: 'R2', version: 2, updatedBy: other.id })
    expect(await model.saveReport(db, created.id, { name: 'R3', definition: emptyDefinition(), expectedVersion: 1, userId: owner.id })).toBeNull()
    expect(await model.saveReport(db, created.id, { name: 'R3', definition: emptyDefinition(), expectedVersion: null, userId: owner.id })).toMatchObject({ version: 3 })
  })

  it('lists own and shared reports with permissions; admins see everything', async () => {
    const mine = await model.createReport(db, { name: 'Meu', ownerId: owner.id, definition: emptyDefinition() })
    const theirs = await model.createReport(db, { name: 'Deles', ownerId: other.id, definition: emptyDefinition() })
    await model.createReport(db, { name: 'Privado', ownerId: other.id, definition: emptyDefinition() })
    await model.replaceShares(db, theirs.id, [{ userId: owner.id, permission: 'view' }])

    const forOwner = await model.listReportsForUser(db, owner)
    expect(forOwner.map((report) => [report.name, report.permission]).sort()).toEqual([
      ['Deles', 'view'],
      ['Meu', 'owner'],
    ])
    const forAdmin = await model.listReportsForUser(db, admin)
    expect(forAdmin).toHaveLength(3)
    expect(forAdmin.find((report) => report.id === mine.id)?.permission).toBe('edit')
  })

  it('computes the permission of a viewer on a report', async () => {
    const report = await model.createReport(db, { name: 'R', ownerId: owner.id, definition: emptyDefinition() })
    expect(await model.reportPermission(db, owner, report.id)).toBe('owner')
    expect(await model.reportPermission(db, admin, report.id)).toBe('edit')
    expect(await model.reportPermission(db, other, report.id)).toBeNull()
    await model.replaceShares(db, report.id, [{ userId: other.id, permission: 'edit' }])
    expect(await model.reportPermission(db, other, report.id)).toBe('edit')
    expect(model.canEdit('view')).toBe(false)
  })

  it('replaces shares atomically and lists them with names', async () => {
    const report = await model.createReport(db, { name: 'R', ownerId: owner.id, definition: emptyDefinition() })
    await model.replaceShares(db, report.id, [{ userId: other.id, permission: 'view' }, { userId: admin.id, permission: 'edit' }])
    await model.replaceShares(db, report.id, [{ userId: other.id, permission: 'edit' }])
    expect(await model.listShares(db, report.id)).toEqual([{ userId: other.id, userName: 'Outra', permission: 'edit' }])
  })

  it('finds reports that use a source anywhere in the definition', async () => {
    await model.createReport(db, { name: 'Usa', ownerId: owner.id, definition: withSource('abc') })
    await model.createReport(db, { name: 'Não usa', ownerId: owner.id, definition: withSource('xyz') })
    expect((await model.reportsUsingSource(db, 'abc')).map((report) => report.name)).toEqual(['Usa'])
  })

  it('keeps only active users as share targets', async () => {
    const pending = await seedUser(db, 'Pendente')
    await db.update(users).set({ status: 'pending' })
    expect(await model.activeUserIds(db, [pending.id, other.id])).toEqual([])
  })

  it('deletes a report', async () => {
    const report = await model.createReport(db, { name: 'R', ownerId: owner.id, definition: emptyDefinition() })
    await model.deleteReport(db, report.id)
    expect(await model.getReport(db, report.id)).toBeNull()
  })
})
