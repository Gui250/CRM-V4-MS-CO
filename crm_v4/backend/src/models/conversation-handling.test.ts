import { beforeEach, describe, expect, it } from 'vitest'
import type { Db } from '../db/client.js'
import { createTestDb } from '../test/db.js'
import * as contactModel from './contact.js'
import * as conversationModel from './conversation.js'
import * as userModel from './user.js'

let db: Db

beforeEach(async () => {
  db = await createTestDb()
})

async function conversationFor(phone: string, name: string) {
  const { contact } = await contactModel.upsertByJid(db, { waJid: `${phone}@s.whatsapp.net`, name })
  return conversationModel.getOrCreateForContact(db, contact.id)
}

const attendant = () =>
  userModel.create(db, { name: 'Bia', email: 'bia@v4.test', passwordHash: 'x', role: 'attendant', status: 'active' })

describe('conversation handling (feature 003)', () => {
  it('starts in automation mode with nobody assigned', async () => {
    const conversation = await conversationFor('5511', 'Ana')
    const found = await conversationModel.findById(db, conversation.id)
    expect(found).toMatchObject({ handlingMode: 'automation', handoffReason: null, assumedBy: null })
  })

  it('hands off to a human with reason and summary, clearing any assignee', async () => {
    const conversation = await conversationFor('5511', 'Ana')
    const user = await attendant()
    await conversationModel.assume(db, conversation.id, user.id)
    await conversationModel.handOff(db, conversation.id, { reason: 'Pediu uma pessoa', summary: 'x'.repeat(1500) })
    const found = await conversationModel.findById(db, conversation.id)
    expect(found).toMatchObject({ handlingMode: 'human', handoffReason: 'Pediu uma pessoa', assumedBy: null })
    expect(found?.handoffSummary).toHaveLength(conversationModel.HANDOFF_SUMMARY_MAX)
    expect(found?.handoffAt).toBeInstanceOf(Date)
  })

  it('assume keeps the hand-off reason and returns the assignee name', async () => {
    const conversation = await conversationFor('5511', 'Ana')
    const user = await attendant()
    await conversationModel.handOff(db, conversation.id, { reason: 'Falha no agente de IA', summary: null })
    await conversationModel.assume(db, conversation.id, user.id)
    const found = await conversationModel.findById(db, conversation.id)
    expect(found).toMatchObject({ handlingMode: 'human', handoffReason: 'Falha no agente de IA', assumedBy: { id: user.id, name: 'Bia' } })
  })

  it('release goes back to automation and clears the hand-off', async () => {
    const conversation = await conversationFor('5511', 'Ana')
    const user = await attendant()
    await conversationModel.handOff(db, conversation.id, { reason: 'x', summary: 'y' })
    await conversationModel.assume(db, conversation.id, user.id)
    await conversationModel.release(db, conversation.id)
    expect(await conversationModel.findById(db, conversation.id)).toMatchObject({
      handlingMode: 'automation',
      handoffReason: null,
      handoffSummary: null,
      handoffAt: null,
      assumedBy: null,
    })
  })

  it('filters conversations awaiting a human (human mode, nobody assigned)', async () => {
    const waiting = await conversationFor('5511', 'Ana')
    const taken = await conversationFor('5521', 'Bruno')
    await conversationFor('5531', 'Caio')
    const user = await attendant()
    await conversationModel.handOff(db, waiting.id, { reason: 'x', summary: null })
    await conversationModel.handOff(db, taken.id, { reason: 'x', summary: null })
    await conversationModel.assume(db, taken.id, user.id)

    const { items } = await conversationModel.list(db, { limit: 10, handling: 'awaiting_human' })
    expect(items.map((c) => c.contact.name)).toEqual(['Ana'])
  })

  it('list includes the assignee', async () => {
    const conversation = await conversationFor('5511', 'Ana')
    const user = await attendant()
    await conversationModel.assume(db, conversation.id, user.id)
    const { items } = await conversationModel.list(db, { limit: 10 })
    expect(items[0]?.assumedBy).toEqual({ id: user.id, name: 'Bia' })
  })
})

describe('contact opt-out (feature 003)', () => {
  it('marks and clears "não automatizar", recording who did it', async () => {
    const { contact } = await contactModel.upsertByJid(db, { waJid: '5511@s.whatsapp.net', name: 'Ana' })
    const user = await attendant()

    await contactModel.setOptOut(db, contact.id, null)
    expect(await contactModel.findById(db, contact.id)).toMatchObject({ automationOptOutByUserId: null, automationOptOutAt: expect.any(Date) })

    await contactModel.setOptOut(db, contact.id, user.id)
    expect((await contactModel.findById(db, contact.id))?.automationOptOutByUserId).toBe(user.id)

    await contactModel.clearOptOut(db, contact.id)
    expect(await contactModel.findById(db, contact.id)).toMatchObject({ automationOptOutAt: null, automationOptOutByUserId: null })
  })
})
