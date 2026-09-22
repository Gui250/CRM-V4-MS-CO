import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { App } from '../app.js'
import { createLocalStorage } from '../integrations/storage/local.js'
import { createEventBus } from '../realtime/bus.js'
import { buildTestApp, sessionCookieFrom } from '../test/app.js'
import { testConfig, type fakeEvolution } from '../test/context.js'
import { createTestDb } from '../test/db.js'

let app: App
let evolution: ReturnType<typeof fakeEvolution>
let cookie: string
let mediaDir: string

const webhook = (event: string, data: unknown) =>
  app.inject({
    method: 'POST',
    url: `/api/webhooks/evolution?token=${testConfig.EVOLUTION_WEBHOOK_TOKEN}`,
    payload: { event, instance: testConfig.EVOLUTION_INSTANCE, data },
  })

const inbound = (id: string, text: string, jid = '5511987654321@s.whatsapp.net', pushName = 'Cliente Silva') =>
  webhook('messages.upsert', { key: { remoteJid: jid, fromMe: false, id }, pushName, message: { conversation: text }, messageType: 'conversation', messageTimestamp: 1760000000 })

const get = (url: string) => app.inject({ url, headers: { cookie } })
const post = (url: string, payload?: Record<string, unknown>) => app.inject({ method: 'POST', url, headers: { cookie }, payload })

beforeEach(async () => {
  mediaDir = await mkdtemp(join(tmpdir(), 'media-'))
  const built = await buildTestApp({ db: await createTestDb(), bus: createEventBus(), storage: createLocalStorage(mediaDir) })
  app = built.app
  evolution = built.evolution
  evolution.fetchProfilePictureUrl.mockResolvedValue(null)
  const signup = await app.inject({ method: 'POST', url: '/api/auth/signup', payload: { name: 'Ana', email: 'a@x.com', password: 'senha-segura' } })
  cookie = sessionCookieFrom(signup.headers['set-cookie'])
  await webhook('connection.update', { state: 'open', wuid: '5511000000000@s.whatsapp.net' })
})
afterEach(() => rm(mediaDir, { recursive: true, force: true }))

async function firstConversation() {
  return (await get('/api/conversations')).json().items[0]
}

describe('conversations flow', () => {
  it('shows an inbound message once even when the webhook repeats, and ignores groups', async () => {
    await inbound('WA1', 'oi')
    await inbound('WA1', 'oi')
    await webhook('messages.upsert', { key: { remoteJid: '1203@g.us', fromMe: false, id: 'G1' }, message: { conversation: 'grupo' }, messageType: 'conversation' })

    const list = (await get('/api/conversations')).json()
    expect(list.items).toHaveLength(1)
    expect(list.items[0]).toMatchObject({ unreadCount: 1, lastMessagePreview: 'oi', contact: { name: 'Cliente Silva', phone: '5511987654321' } })

    const history = (await get(`/api/conversations/${list.items[0].id}/messages`)).json()
    expect(history.items).toHaveLength(1)
    expect(history.items[0]).toMatchObject({ direction: 'inbound', type: 'text', body: 'oi', status: null })
  })

  it('sends a reply, updates delivery status from the webhook, and marks as read', async () => {
    await inbound('WA1', 'oi')
    const conversation = await firstConversation()
    evolution.sendText.mockResolvedValue({ waMessageId: 'OUT1' })

    const sent = await post(`/api/conversations/${conversation.id}/messages`, { text: 'Olá! Como posso ajudar?' })
    expect(sent.statusCode).toBe(202)
    expect(sent.json()).toMatchObject({ direction: 'outbound', status: 'sent', sentBy: { name: 'Ana' } })
    expect(evolution.sendText).toHaveBeenCalledWith('5511987654321', 'Olá! Como posso ajudar?')

    await webhook('messages.update', { keyId: 'OUT1', status: 'READ' })
    const history = (await get(`/api/conversations/${conversation.id}/messages`)).json()
    expect(history.items[0]).toMatchObject({ body: 'Olá! Como posso ajudar?', status: 'read' })

    evolution.markAsRead.mockResolvedValue(undefined)
    expect((await post(`/api/conversations/${conversation.id}/read`)).statusCode).toBe(204)
    expect((await firstConversation()).unreadCount).toBe(0)
    expect(evolution.markAsRead).toHaveBeenCalledWith('5511987654321@s.whatsapp.net', 'WA1')
  })

  it('marks a send as failed and lets the attendant retry it', async () => {
    await inbound('WA1', 'oi')
    const conversation = await firstConversation()
    evolution.sendText.mockRejectedValueOnce(new Error('down'))

    const failed = (await post(`/api/conversations/${conversation.id}/messages`, { text: 'teste' })).json()
    expect(failed.status).toBe('failed')

    evolution.sendText.mockResolvedValueOnce({ waMessageId: 'OUT2' })
    const retried = await post(`/api/messages/${failed.id}/retry`)
    expect(retried.statusCode).toBe(202)
    expect(retried.json().status).toBe('sent')

    expect((await post(`/api/messages/${failed.id}/retry`)).json()).toMatchObject({ code: 'NOT_RETRYABLE' })
  })

  it('refuses to send while disconnected', async () => {
    await inbound('WA1', 'oi')
    const conversation = await firstConversation()
    await webhook('connection.update', { state: 'close' })

    const response = await post(`/api/conversations/${conversation.id}/messages`, { text: 'oi' })
    expect(response.statusCode).toBe(409)
    expect(response.json()).toMatchObject({ code: 'WHATSAPP_DISCONNECTED' })
  })

  it('validates input and requires a session', async () => {
    await inbound('WA1', 'oi')
    const conversation = await firstConversation()
    expect((await post(`/api/conversations/${conversation.id}/messages`, { text: '' })).statusCode).toBe(422)
    expect((await get('/api/conversations?limit=500')).statusCode).toBe(422)
    expect((await get('/api/conversations/nao-e-uuid/messages')).statusCode).toBe(422)
    expect((await app.inject({ url: '/api/conversations' })).statusCode).toBe(401)
  })

  it('searches by name or phone and filters unread', async () => {
    await inbound('A1', 'oi', '5511987654321@s.whatsapp.net', 'Ana Souza')
    await inbound('B1', 'olá', '5521912345678@s.whatsapp.net', 'Bruno Lima')
    const bruno = (await get('/api/conversations?search=bruno')).json().items
    expect(bruno.map((c: { contact: { name: string } }) => c.contact.name)).toEqual(['Bruno Lima'])
    expect((await get('/api/conversations?search=98765')).json().items).toHaveLength(1)

    await post(`/api/conversations/${bruno[0].id}/read`)
    const unread = (await get('/api/conversations?unread=true')).json().items
    expect(unread.map((c: { contact: { name: string } }) => c.contact.name)).toEqual(['Ana Souza'])
  })
})

describe('media', () => {
  it('stores inbound media and streams it back inline', async () => {
    evolution.getMediaBase64.mockResolvedValue({ base64: Buffer.from('fake-jpeg').toString('base64'), mimetype: 'image/jpeg', fileName: null })
    await webhook('messages.upsert', {
      key: { remoteJid: '5511987654321@s.whatsapp.net', fromMe: false, id: 'IMG1' },
      pushName: 'Cliente',
      message: { imageMessage: { mimetype: 'image/jpeg', caption: 'foto do produto' } },
      messageType: 'imageMessage',
      messageTimestamp: 1760000000,
    })
    const conversation = await firstConversation()
    const [message] = (await get(`/api/conversations/${conversation.id}/messages`)).json().items
    expect(message).toMatchObject({ type: 'image', body: 'foto do produto', media: { mime: 'image/jpeg' } })

    const media = await get(message.media.url)
    expect(media.statusCode).toBe(200)
    expect(media.headers['content-type']).toBe('image/jpeg')
    expect(media.headers['content-disposition']).toBe('inline')
    expect(media.body).toBe('fake-jpeg')
  })

  it('uploads a document with caption via multipart and sends it', async () => {
    await inbound('WA1', 'oi')
    const conversation = await firstConversation()
    evolution.sendMedia.mockResolvedValue({ waMessageId: 'DOC1' })
    const form = new FormData()
    form.append('caption', 'Proposta comercial')
    form.append('file', new Blob(['%PDF-1.4'], { type: 'application/pdf' }), 'proposta ção.pdf')

    const response = await app.inject({ method: 'POST', url: `/api/conversations/${conversation.id}/messages`, headers: { cookie }, payload: form })

    expect(response.statusCode).toBe(202)
    expect(response.json()).toMatchObject({ type: 'document', body: 'Proposta comercial', status: 'sent', media: { filename: 'proposta ção.pdf' } })
    expect(evolution.sendMedia).toHaveBeenCalledWith(expect.objectContaining({ mediatype: 'document', fileName: 'proposta ção.pdf', base64: Buffer.from('%PDF-1.4').toString('base64') }))

    const download = await get(response.json().media.url)
    expect(download.headers['content-disposition']).toBe("attachment; filename*=UTF-8''proposta%20%C3%A7%C3%A3o.pdf")
  })

  it('never serves scriptable media inline', async () => {
    evolution.getMediaBase64.mockResolvedValue({ base64: Buffer.from('<svg onload="alert(1)"/>').toString('base64'), mimetype: 'image/svg+xml', fileName: null })
    await webhook('messages.upsert', {
      key: { remoteJid: '5511987654321@s.whatsapp.net', fromMe: false, id: 'SVG1' },
      message: { imageMessage: { mimetype: 'image/svg+xml' } },
      messageType: 'imageMessage',
    })
    const conversation = await firstConversation()
    const [message] = (await get(`/api/conversations/${conversation.id}/messages`)).json().items

    const media = await get(message.media.url)
    expect(media.headers['content-disposition']).toMatch(/^attachment/)
    expect(media.headers['content-security-policy']).toContain('sandbox')
  })

  it('rejects unsupported uploads with 415', async () => {
    await inbound('WA1', 'oi')
    const conversation = await firstConversation()
    const form = new FormData()
    form.append('file', new Blob(['x'], { type: 'video/mp4' }), 'video.mp4')

    const response = await app.inject({ method: 'POST', url: `/api/conversations/${conversation.id}/messages`, headers: { cookie }, payload: form })
    expect(response.statusCode).toBe(415)
  })
})

describe('lead entry from WhatsApp (feature 002)', () => {
  it('creates exactly one lead in the entry pipeline on the first inbound message', async () => {
    await inbound('WA1', 'oi')
    await inbound('WA1', 'oi')
    await inbound('WA2', 'tudo bem?')

    const conversation = await firstConversation()
    const leads = (await get(`/api/leads?contactId=${conversation.contact.id}`)).json()
    expect(leads).toHaveLength(1)
    const board = (await get(`/api/pipelines/${leads[0].pipelineId}/board`)).json()
    expect(board.pipeline.name).toBe('Vendas')
    expect(board.stages[0]).toMatchObject({ name: 'Novo', leadCount: 1 })
    expect(board.stages[0].leads[0]).toMatchObject({ conversationId: conversation.id, unreadCount: 2 })
  })

  it('does not create a lead from a message sent by the company phone', async () => {
    await webhook('messages.upsert', {
      key: { remoteJid: '5511987654321@s.whatsapp.net', fromMe: true, id: 'OUT1' },
      message: { conversation: 'Olá, tudo bem?' },
      messageType: 'conversation',
      messageTimestamp: 1760000000,
    })
    const conversation = await firstConversation()
    expect((await get(`/api/leads?contactId=${conversation.contact.id}`)).json()).toEqual([])

    await inbound('WA9', 'oi, tudo')
    expect((await get(`/api/leads?contactId=${conversation.contact.id}`)).json()).toHaveLength(1)
  })
})

