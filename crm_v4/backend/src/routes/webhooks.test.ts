import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { App } from '../app.js'
import * as connection from '../controllers/connection.js'
import * as messages from '../controllers/messages.js'
import { buildTestApp } from '../test/app.js'
import { testConfig } from '../test/context.js'

vi.mock('../controllers/connection.js')
vi.mock('../controllers/messages.js')

let app: App
beforeEach(async () => {
  vi.resetAllMocks()
  ;({ app } = await buildTestApp())
})

const post = (payload: Record<string, unknown>, token: string | null = testConfig.EVOLUTION_WEBHOOK_TOKEN) =>
  app.inject({ method: 'POST', url: `/api/webhooks/evolution${token === null ? '' : `?token=${token}`}`, payload })

const envelope = (event: string, data: unknown, instance = testConfig.EVOLUTION_INSTANCE) => ({ event, instance, data })

describe('evolution webhook', () => {
  it('rejects a missing or wrong token without processing', async () => {
    const payload = envelope('qrcode.updated', { qrcode: { base64: 'QR' } })
    expect((await post(payload, null)).statusCode).toBe(401)
    expect((await post(payload, 'errado')).statusCode).toBe(401)
    expect(connection.handleQrUpdated).not.toHaveBeenCalled()
  })

  it('ignores unknown events and other instances with 200', async () => {
    expect((await post(envelope('presence.update', {}))).statusCode).toBe(200)
    expect((await post(envelope('qrcode.updated', { qrcode: { base64: 'QR' } }, 'outra'))).statusCode).toBe(200)
    expect((await post({ nada: true })).statusCode).toBe(200)
    expect(connection.handleQrUpdated).not.toHaveBeenCalled()
  })

  it('dispatches QR and connection events (dotted or upper-case names)', async () => {
    await post(envelope('qrcode.updated', { qrcode: { base64: 'data:image/png;base64,QR' } }))
    expect(connection.handleQrUpdated).toHaveBeenCalledWith(expect.anything(), 'data:image/png;base64,QR')

    await post(envelope('CONNECTION_UPDATE', { state: 'open', wuid: '5511@s.whatsapp.net' }))
    expect(connection.handleConnectionUpdate).toHaveBeenCalledWith(expect.anything(), { state: 'open', wuid: '5511@s.whatsapp.net' })
  })

  it('dispatches message upserts and status updates', async () => {
    const message = { key: { remoteJid: '5511@s.whatsapp.net', fromMe: false, id: 'WA1' }, pushName: 'Cliente', message: { conversation: 'oi' }, messageType: 'conversation', messageTimestamp: 1760000000 }
    await post(envelope('messages.upsert', message))
    expect(messages.receive).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ key: message.key }))

    await post(envelope('messages.update', { keyId: 'WA1', status: 'READ', remoteJid: 'x', fromMe: true }))
    expect(messages.updateStatus).toHaveBeenCalledWith(expect.anything(), 'WA1', 'READ')
  })
})
