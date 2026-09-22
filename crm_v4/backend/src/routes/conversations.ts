import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import type { RouteDeps } from '../app.js'
import * as conversations from '../controllers/conversations.js'
import * as handling from '../controllers/handling.js'
import * as runs from '../controllers/runs.js'
import * as messages from '../controllers/messages.js'
import { DomainError } from '../lib/errors.js'
import { currentUser } from './auth-guard.js'

const page = { cursor: z.string().max(200).optional(), limit: z.coerce.number().int().min(1).max(100).default(50) }
const idParams = z.object({ id: z.uuid() })
const textBody = z.object({ text: z.string().min(1).max(messages.TEXT_MAX) })

// A route table: each handler is a few lines of validation delegating to a controller.
// eslint-disable-next-line max-lines-per-function
export const registerConversationRoutes: FastifyPluginAsyncZod<RouteDeps> = async (app, { ctx, guard }) => {
  app.get(
    '/api/conversations',
    {
      preHandler: guard.requireAuth,
      schema: {
        querystring: z.object({
          ...page,
          search: z.string().max(100).optional(),
          unread: z.enum(['true', 'false']).optional().transform((value) => value === 'true'),
          handling: z.enum(['awaiting_human']).optional(),
        }),
      },
    },
    (request) => conversations.list(ctx, request.query),
  )

  app.get(
    '/api/conversations/:id/messages',
    { preHandler: guard.requireAuth, schema: { params: idParams, querystring: z.object(page) } },
    (request) => conversations.listMessages(ctx, request.params.id, request.query),
  )

  app.post(
    '/api/conversations/:id/messages',
    { preHandler: guard.requireAuth, schema: { params: idParams } },
    async (request, reply) => {
      const user = currentUser(request)
      if (request.isMultipart()) {
        const file = await request.file()
        if (!file) throw new DomainError('VALIDATION_ERROR', 'Envie um arquivo.', 422)
        const data = await file.toBuffer()
        const captionField = file.fields.caption
        const caption = captionField && 'value' in captionField ? String(captionField.value) : undefined
        const message = await messages.sendMedia(ctx, user, request.params.id, {
          data,
          mime: file.mimetype,
          filename: file.filename,
          caption,
        })
        return reply.status(202).send(message)
      }
      const body = textBody.safeParse(request.body)
      if (!body.success) throw new DomainError('VALIDATION_ERROR', 'A mensagem precisa ter entre 1 e 4096 caracteres.', 422)
      return reply.status(202).send(await messages.sendText(ctx, user, request.params.id, body.data.text))
    },
  )

  // Feature 003: hand-off and flows started from the chat (FR-022..FR-027).
  app.post('/api/conversations/:id/assume', { preHandler: guard.requireAuth, schema: { params: idParams } }, (request) =>
    handling.assume(ctx, currentUser(request), request.params.id),
  )

  app.post('/api/conversations/:id/release', { preHandler: guard.requireAuth, schema: { params: idParams } }, (request) =>
    handling.release(ctx, request.params.id),
  )

  app.get('/api/conversations/:id/runs', { preHandler: guard.requireAuth, schema: { params: idParams } }, (request) =>
    runs.listForConversation(ctx, request.params.id),
  )

  app.post(
    '/api/conversations/:id/start-flow',
    { preHandler: guard.requireAuth, schema: { params: idParams, body: z.object({ flowId: z.uuid() }) } },
    async (request, reply) =>
      reply.status(201).send(await runs.startManual(ctx, currentUser(request), request.params.id, request.body.flowId)),
  )

  app.post(
    '/api/conversations/start-flow',
    { preHandler: guard.requireAuth, schema: { body: z.object({ phone: z.string().max(20), flowId: z.uuid() }) } },
    async (request, reply) =>
      reply.status(201).send(await runs.startManualForPhone(ctx, currentUser(request), request.body.phone, request.body.flowId)),
  )

  app.post(
    '/api/conversations/:id/read',
    { preHandler: guard.requireAuth, schema: { params: idParams } },
    async (request, reply) => {
      await conversations.markRead(ctx, request.params.id)
      return reply.status(204).send()
    },
  )
}
