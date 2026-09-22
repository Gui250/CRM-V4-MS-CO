import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import type { RouteDeps } from '../app.js'
import { flowGraphSchema } from '../controllers/automation/graph-schema.js'
import * as flows from '../controllers/flows.js'
import { DomainError, forbidden } from '../lib/errors.js'
import { currentUser } from './auth-guard.js'

const idParams = z.object({ id: z.uuid() })
const name = z.string().trim().min(1).max(100)
const description = z.string().max(500).nullable()
const phone = z.string().regex(/^\d{10,15}$/, 'Informe só dígitos, com DDI (10 a 15).')
const listQuery = z.object({
  status: z.enum(['draft', 'active', 'inactive']).optional(),
  trigger: z.enum(['message_received', 'manual']).optional(),
})

// eslint-disable-next-line max-lines-per-function -- one registration per endpoint of the flows contract
export const registerFlowRoutes: FastifyPluginAsyncZod<RouteDeps> = async (app, { ctx, guard }) => {
  const admin = { preHandler: guard.requireAdmin }

  // Attendants only see the chat's start menu: active flows (FR-029).
  app.get('/api/flows', { preHandler: guard.requireAuth, schema: { querystring: listQuery } }, (request) => {
    const isChatMenu = request.query.trigger === undefined && request.query.status === 'active'
    if (currentUser(request).role !== 'admin' && !isChatMenu) throw forbidden()
    return flows.list(ctx, request.query)
  })

  app.post('/api/flows', { ...admin, schema: { body: z.object({ name, description: description.optional() }) } }, async (request, reply) =>
    reply.status(201).send(await flows.create(ctx, currentUser(request), request.body)),
  )

  app.get('/api/flows/:id', { ...admin, schema: { params: idParams } }, (request) => flows.get(ctx, request.params.id))

  app.patch(
    '/api/flows/:id',
    {
      ...admin,
      schema: {
        params: idParams,
        body: z
          .object({ name: name.optional(), description: description.optional(), priority: z.number().int().min(1).max(1000).optional() })
          .refine((body) => Object.keys(body).length > 0, 'Nada para alterar.'),
      },
    },
    (request) => flows.update(ctx, currentUser(request), request.params.id, request.body),
  )

  app.delete('/api/flows/:id', { ...admin, schema: { params: idParams } }, async (request, reply) => {
    await flows.remove(ctx, request.params.id)
    return reply.status(204).send()
  })

  app.put('/api/flows/:id/graph', { ...admin, schema: { params: idParams, body: flowGraphSchema } }, (request) =>
    flows.saveGraph(ctx, currentUser(request), request.params.id, request.body),
  )

  app.post('/api/flows/:id/activate', { ...admin, schema: { params: idParams } }, (request) =>
    flows.activate(ctx, currentUser(request), request.params.id),
  )

  app.post('/api/flows/:id/deactivate', { ...admin, schema: { params: idParams } }, (request) =>
    flows.deactivate(ctx, currentUser(request), request.params.id),
  )

  app.post('/api/flows/:id/duplicate', { ...admin, schema: { params: idParams } }, async (request, reply) =>
    reply.status(201).send(await flows.duplicate(ctx, currentUser(request), request.params.id)),
  )

  app.post(
    '/api/flows/:id/test',
    { ...admin, schema: { params: idParams, body: z.object({ graph: flowGraphSchema, phone }) } },
    async (request, reply) => reply.status(201).send(await flows.startTest(ctx, currentUser(request), request.params.id, request.body)),
  )

  app.post('/api/flow-assets', admin, async (request, reply) => {
    const file = await request.file()
    if (!file) throw new DomainError('VALIDATION_ERROR', 'Envie um arquivo.', 422)
    const asset = await flows.uploadAsset(ctx, { data: await file.toBuffer(), mime: file.mimetype, filename: file.filename })
    return reply.status(201).send(asset)
  })

  app.get('/api/flow-assets/*', admin, async (request, reply) => {
    const path = (request.params as { '*': string })['*']
    const stream = await flows.getAsset(ctx, `${flows.ASSET_PREFIX}/${path.replace(/^automation\//, '')}`)
    return reply.header('Content-Type', 'application/octet-stream').header('Content-Disposition', 'attachment').send(stream)
  })
}
