import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createEvolutionClient, WEBHOOK_EVENTS } from './client.js'

const fetchMock = vi.fn<typeof fetch>()

const client = createEvolutionClient({
  baseUrl: 'http://evo.test',
  apiKey: 'secret-key',
  instance: 'v4-msco',
  webhookUrl: 'http://backend.test/api/webhooks/evolution?token=abc',
  fetch: fetchMock,
})

const reply = (body: unknown, status = 200) =>
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(body), { status }))

const lastCall = () => {
  const [url, init] = fetchMock.mock.calls.at(-1)!
  return { url: String(url), init: init!, body: init?.body ? JSON.parse(String(init.body)) : undefined }
}

beforeEach(() => fetchMock.mockReset())

describe('evolution client: connection', () => {
  it('sends the apikey header', async () => {
    reply({ instance: { state: 'open' } })
    await client.connectionState()
    expect(lastCall().init.headers).toMatchObject({ apikey: 'secret-key' })
  })

  it('checks and creates the instance', async () => {
    reply([{ name: 'v4-msco' }])
    expect(await client.instanceExists()).toBe(true)
    reply([])
    expect(await client.instanceExists()).toBe(false)
    // Evolution v2.3 answers 404 (not an empty list) for an unknown instance.
    reply({ status: 404, error: 'Not Found', response: { message: ['Instance "v4-msco" not found'] } }, 404)
    expect(await client.instanceExists()).toBe(false)

    reply({ instance: {} })
    await client.createInstance()
    expect(lastCall()).toMatchObject({
      url: 'http://evo.test/instance/create',
      body: { instanceName: 'v4-msco', integration: 'WHATSAPP-BAILEYS', qrcode: true },
    })
  })

  it('returns the QR code from connect, or null when already connected', async () => {
    reply({ base64: 'data:image/png;base64,AAA', code: 'x' })
    expect(await client.connect()).toEqual({ qrCode: 'data:image/png;base64,AAA' })
    reply({ instance: { state: 'open' } })
    expect(await client.connect()).toEqual({ qrCode: null })
  })

  it('reads the connection state and logs out', async () => {
    reply({ instance: { instanceName: 'v4-msco', state: 'connecting' } })
    expect(await client.connectionState()).toBe('connecting')

    reply({ status: 'SUCCESS' })
    await client.logout()
    expect(lastCall()).toMatchObject({ url: 'http://evo.test/instance/logout/v4-msco', init: { method: 'DELETE' } })
  })

  it('configures the webhook with the token URL and the four events', async () => {
    reply({})
    await client.setWebhook()
    expect(lastCall()).toMatchObject({
      url: 'http://evo.test/webhook/set/v4-msco',
      body: {
        webhook: {
          enabled: true,
          url: 'http://backend.test/api/webhooks/evolution?token=abc',
          byEvents: false,
          events: [...WEBHOOK_EVENTS],
        },
      },
    })
  })

  it('maps HTTP errors, network errors and malformed bodies to EVOLUTION_UNAVAILABLE', async () => {
    reply({ error: 'x' }, 500)
    await expect(client.connectionState()).rejects.toMatchObject({ code: 'EVOLUTION_UNAVAILABLE', httpStatus: 502 })

    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'))
    await expect(client.connectionState()).rejects.toMatchObject({ code: 'EVOLUTION_UNAVAILABLE' })

    reply({ unexpected: true })
    await expect(client.connectionState()).rejects.toMatchObject({ code: 'EVOLUTION_UNAVAILABLE' })
  })
})

describe('evolution client: messages', () => {
  it('sends text and returns the WhatsApp message id', async () => {
    reply({ key: { remoteJid: '5511@s.whatsapp.net', fromMe: true, id: 'WA1' }, status: 'PENDING' })

    expect(await client.sendText('5511999999999', 'oi')).toEqual({ waMessageId: 'WA1' })
    expect(lastCall()).toMatchObject({
      url: 'http://evo.test/message/sendText/v4-msco',
      body: { number: '5511999999999', text: 'oi' },
    })
  })

  it('rejects a send response without key.id', async () => {
    reply({ key: { remoteJid: 'x', fromMe: true } })
    await expect(client.sendText('55', 'oi')).rejects.toMatchObject({ code: 'EVOLUTION_UNAVAILABLE' })
  })

  it('marks a message as read', async () => {
    reply({})
    await client.markAsRead('5511@s.whatsapp.net', 'WA9')
    expect(lastCall().body).toEqual({ readMessages: [{ remoteJid: '5511@s.whatsapp.net', fromMe: false, id: 'WA9' }] })
  })

  it('fetches the profile picture URL, or null', async () => {
    reply({ wuid: 'x', profilePictureUrl: 'https://pps.whatsapp.net/a.jpg' })
    expect(await client.fetchProfilePictureUrl('5511')).toBe('https://pps.whatsapp.net/a.jpg')
    reply({ wuid: 'x', profilePictureUrl: null })
    expect(await client.fetchProfilePictureUrl('5511')).toBeNull()
  })

  it('checks whether a number has WhatsApp', async () => {
    reply([{ exists: true, jid: '5511999999999@s.whatsapp.net', number: '5511999999999' }])
    expect(await client.checkWhatsAppNumber('5511999999999')).toEqual({ exists: true, jid: '5511999999999@s.whatsapp.net' })
    expect(lastCall().body).toEqual({ numbers: ['5511999999999'] })
    reply([{ exists: false, jid: '5511@s.whatsapp.net', number: '5511' }])
    expect(await client.checkWhatsAppNumber('5511')).toEqual({ exists: false, jid: null })
  })
})

describe('evolution client: media', () => {
  it('downloads media as base64', async () => {
    reply({ base64: 'QUJD', mimetype: 'image/jpeg', fileName: 'foto.jpg', mediaType: 'imageMessage' })

    expect(await client.getMediaBase64('WA5')).toEqual({ base64: 'QUJD', mimetype: 'image/jpeg', fileName: 'foto.jpg' })
    expect(lastCall().body).toEqual({ message: { key: { id: 'WA5' } }, convertToMp4: false })
  })

  it('rejects a media response without base64', async () => {
    reply({ mimetype: 'image/jpeg' })
    await expect(client.getMediaBase64('WA5')).rejects.toMatchObject({ code: 'EVOLUTION_UNAVAILABLE' })
  })

  it('sends media and returns the WhatsApp message id', async () => {
    reply({ key: { remoteJid: 'x', fromMe: true, id: 'WA7' } })

    const result = await client.sendMedia({
      number: '5511',
      mediatype: 'document',
      mimetype: 'application/pdf',
      caption: 'proposta',
      base64: 'JVBER',
      fileName: 'proposta.pdf',
    })

    expect(result).toEqual({ waMessageId: 'WA7' })
    expect(lastCall().body).toEqual({
      number: '5511',
      mediatype: 'document',
      mimetype: 'application/pdf',
      caption: 'proposta',
      media: 'JVBER',
      fileName: 'proposta.pdf',
    })
  })
})
