import { timingSafeEqual } from 'node:crypto'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import type { RouteDeps } from '../app.js'
import type { AppContext } from '../context.js'
import * as connection from '../controllers/connection.js'
import * as messages from '../controllers/messages.js'
import * as schemas from '../integrations/evolution/webhook-schemas.js'
import { unauthorized } from '../lib/errors.js'

const asArray = <T>(value: T | T[]) => (Array.isArray(value) ? value : [value])

function tokenMatches(received: string | undefined, expected: string): boolean {
  if (!received) return false
  const a = Buffer.from(received)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

type Handler = (ctx: AppContext, data: unknown) => Promise<void>

const handlers: Record<string, Handler> = {
  QRCODE_UPDATED: async (ctx, data) => {
    const parsed = schemas.qrUpdatedData.safeParse(data)
    if (parsed.success) await connection.handleQrUpdated(ctx, parsed.data.qrcode.base64)
  },
  CONNECTION_UPDATE: async (ctx, data) => {
    const parsed = schemas.connectionUpdateData.safeParse(data)
    if (parsed.success) await connection.handleConnectionUpdate(ctx, parsed.data)
  },
  MESSAGES_UPSERT: async (ctx, data) => {
    const parsed = schemas.messagesUpsertData.safeParse(data)
    if (!parsed.success) return
    for (const message of asArray(parsed.data)) await messages.receive(ctx, message)
  },
  MESSAGES_UPDATE: async (ctx, data) => {
    const parsed = schemas.messagesUpdateData.safeParse(data)
    if (!parsed.success) return
    for (const update of asArray(parsed.data)) {
      if (update.waMessageId) await messages.updateStatus(ctx, update.waMessageId, update.status)
    }
  },
}

export const registerWebhookRoutes: FastifyPluginAsyncZod<RouteDeps> = async (app, { ctx }) => {
  app.post(
    '/api/webhooks/evolution',
    { schema: { querystring: z.object({ token: z.string().optional() }) } },
    async (request, reply) => {
      if (!tokenMatches(request.query.token, ctx.config.EVOLUTION_WEBHOOK_TOKEN)) throw unauthorized('INVALID_TOKEN', 'Token inválido.')

      const envelope = schemas.envelopeSchema.safeParse(request.body)
      if (!envelope.success || envelope.data.instance !== ctx.config.EVOLUTION_INSTANCE) return reply.status(200).send({ ok: true })

      const handler = handlers[envelope.data.event]
      if (handler) await handler(ctx, envelope.data.data)
      return reply.status(200).send({ ok: true })
    },
  )
}
