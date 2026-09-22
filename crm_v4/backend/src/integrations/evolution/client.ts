import type { z } from 'zod'
import { DomainError } from '../../lib/errors.js'
import * as schemas from './response-schemas.js'

export const WEBHOOK_EVENTS = [
  'QRCODE_UPDATED',
  'CONNECTION_UPDATE',
  'MESSAGES_UPSERT',
  'MESSAGES_UPDATE',
] as const

export type MediaType = 'image' | 'document'

export interface EvolutionClient {
  instanceExists(): Promise<boolean>
  createInstance(): Promise<void>
  connect(): Promise<{ qrCode: string | null }>
  connectionState(): Promise<string>
  logout(): Promise<void>
  setWebhook(): Promise<void>
  sendText(number: string, text: string): Promise<{ waMessageId: string }>
  sendMedia(input: {
    number: string
    mediatype: MediaType
    mimetype: string
    caption?: string
    base64: string
    fileName: string
  }): Promise<{ waMessageId: string }>
  markAsRead(remoteJid: string, waMessageId: string): Promise<void>
  getMediaBase64(waMessageId: string): Promise<{ base64: string; mimetype: string; fileName: string | null }>
  fetchProfilePictureUrl(number: string): Promise<string | null>
  checkWhatsAppNumber(number: string): Promise<{ exists: boolean; jid: string | null }>
}

interface Options {
  baseUrl: string
  apiKey: string
  instance: string
  webhookUrl: string
  fetch?: typeof fetch
}

const unavailable = (detail: string) =>
  new DomainError('EVOLUTION_UNAVAILABLE', `Não foi possível falar com o WhatsApp (${detail}).`, 502)

// One small method per Evolution endpoint; the factory is long only because it lists them all.
// eslint-disable-next-line max-lines-per-function
export function createEvolutionClient(options: Options): EvolutionClient {
  const doFetch = options.fetch ?? fetch
  const instance = encodeURIComponent(options.instance)

  async function request<S extends z.ZodType>(
    method: string,
    path: string,
    schema: S | null,
    body?: unknown,
    opts: { notFoundAs?: z.infer<S> } = {},
  ): Promise<z.infer<S>> {
    let response: Response
    try {
      response = await doFetch(`${options.baseUrl}${path}`, {
        method,
        headers: { apikey: options.apiKey, 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
    } catch {
      throw unavailable('sem resposta')
    }
    if (response.status === 404 && 'notFoundAs' in opts) return opts.notFoundAs as z.infer<S>
    if (!response.ok) throw unavailable(`HTTP ${response.status}`)
    if (!schema) return undefined as z.infer<S>
    const parsed = schema.safeParse(await response.json().catch(() => undefined))
    if (!parsed.success) throw unavailable('resposta inválida')
    return parsed.data
  }

  return {
    async instanceExists() {
      // v2.3 answers 404 instead of an empty list when the instance does not exist.
      const list = await request('GET', `/instance/fetchInstances?instanceName=${instance}`, schemas.fetchInstancesResponse, undefined, {
        notFoundAs: [],
      })
      return list.length > 0
    },
    async createInstance() {
      await request('POST', '/instance/create', null, {
        instanceName: options.instance,
        integration: 'WHATSAPP-BAILEYS',
        qrcode: true,
      })
    },
    async connect() {
      const result = await request('GET', `/instance/connect/${instance}`, schemas.connectResponse)
      return { qrCode: result.base64 ?? null }
    },
    async connectionState() {
      const result = await request('GET', `/instance/connectionState/${instance}`, schemas.connectionStateResponse)
      return result.instance.state
    },
    async logout() {
      await request('DELETE', `/instance/logout/${instance}`, null)
    },
    async setWebhook() {
      await request('POST', `/webhook/set/${instance}`, null, {
        webhook: {
          enabled: true,
          url: options.webhookUrl,
          byEvents: false,
          base64: false,
          events: WEBHOOK_EVENTS,
        },
      })
    },
    async sendText(number, text) {
      const result = await request('POST', `/message/sendText/${instance}`, schemas.sendMessageResponse, { number, text })
      return { waMessageId: result.key.id }
    },
    async sendMedia(input) {
      const result = await request('POST', `/message/sendMedia/${instance}`, schemas.sendMessageResponse, {
        number: input.number,
        mediatype: input.mediatype,
        mimetype: input.mimetype,
        caption: input.caption,
        media: input.base64,
        fileName: input.fileName,
      })
      return { waMessageId: result.key.id }
    },
    async markAsRead(remoteJid, waMessageId) {
      await request('POST', `/chat/markMessageAsRead/${instance}`, null, {
        readMessages: [{ remoteJid, fromMe: false, id: waMessageId }],
      })
    },
    async getMediaBase64(waMessageId) {
      const result = await request('POST', `/chat/getBase64FromMediaMessage/${instance}`, schemas.mediaBase64Response, {
        message: { key: { id: waMessageId } },
        convertToMp4: false,
      })
      return { base64: result.base64, mimetype: result.mimetype, fileName: result.fileName ?? null }
    },
    async fetchProfilePictureUrl(number) {
      const result = await request('POST', `/chat/fetchProfilePictureUrl/${instance}`, schemas.profilePictureResponse, {
        number,
      })
      return result.profilePictureUrl ?? null
    },
    async checkWhatsAppNumber(number) {
      const [result] = await request('POST', `/chat/whatsappNumbers/${instance}`, schemas.whatsappNumbersResponse, { numbers: [number] })
      return { exists: result?.exists ?? false, jid: result?.exists ? (result.jid ?? null) : null }
    },
  }
}
