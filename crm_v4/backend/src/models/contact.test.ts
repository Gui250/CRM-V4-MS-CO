import { beforeEach, describe, expect, it } from 'vitest'
import type { Db } from '../db/client.js'
import { createTestDb } from '../test/db.js'
import * as contactModel from './contact.js'

let db: Db
beforeEach(async () => {
  db = await createTestDb()
})

describe('contact model', () => {
  it('creates a contact with the phone digits from the JID', async () => {
    const { contact, created } = await contactModel.upsertByJid(db, { waJid: '5511987654321@s.whatsapp.net', name: 'Cliente' })
    expect(created).toBe(true)
    expect(contact).toMatchObject({ phone: '5511987654321', name: 'Cliente' })
  })

  it('updates the name only when one is provided', async () => {
    const jid = '5511987654321@s.whatsapp.net'
    await contactModel.upsertByJid(db, { waJid: jid, name: 'Cliente' })

    const keep = await contactModel.upsertByJid(db, { waJid: jid, name: null })
    expect(keep).toMatchObject({ created: false, contact: { name: 'Cliente' } })

    const rename = await contactModel.upsertByJid(db, { waJid: jid, name: 'Cliente Novo' })
    expect(rename.contact.name).toBe('Cliente Novo')
    expect(rename.contact.id).toBe(keep.contact.id)
  })

  it('rejects group JIDs', async () => {
    await expect(contactModel.upsertByJid(db, { waJid: '1203630@g.us', name: 'Grupo' })).rejects.toThrow()
  })

  it('sets the avatar URL', async () => {
    const { contact } = await contactModel.upsertByJid(db, { waJid: '55@s.whatsapp.net', name: null })
    await contactModel.setAvatar(db, contact.id, 'https://pps.whatsapp.net/a.jpg')
    const again = await contactModel.upsertByJid(db, { waJid: '55@s.whatsapp.net', name: null })
    expect(again.contact.avatarUrl).toBe('https://pps.whatsapp.net/a.jpg')
  })
})

describe('contact model: findById', () => {
  it('finds a contact or returns null', async () => {
    const { contact } = await contactModel.upsertByJid(db, { waJid: '5511@s.whatsapp.net', name: 'Cliente' })
    expect(await contactModel.findById(db, contact.id)).toMatchObject({ name: 'Cliente' })
    expect(await contactModel.findById(db, '00000000-0000-0000-0000-000000000000')).toBeNull()
  })
})
