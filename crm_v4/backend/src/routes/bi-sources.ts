import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import type { RouteDeps } from '../app.js'
import * as sources from '../controllers/bi-sources.js'
import { SOURCE_KINDS } from '../integrations/bi-connectors/index.js'
import { DomainError } from '../lib/errors.js'
import { fieldTypeSchema } from '../models/bi/definition.js'
import { currentUser } from './auth-guard.js'

const refreshInterval = z.enum(['manual', '15m', '1h', '6h', '24h'])
// Per-kind config is validated by the controller with the connector schemas (data-model.md).
const sourceInput = z.object({
  name: z.string().trim().min(2).max(100),
  kind: z.enum(SOURCE_KINDS),
  config: z.record(z.string(), z.unknown()),
  secrets: z.record(z.string(), z.unknown()).optional(),
  refreshInterval: refreshInterval.optional(),
  fieldTypes: z.record(z.string(), fieldTypeSchema).optional(),
  fieldLabels: z.record(z.string(), z.string().max(200)).optional(),
})
const sourceUpdate = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  secrets: z.record(z.string(), z.unknown()).optional(),
  refreshInterval: refreshInterval.optional(),
  fieldTypes: z.record(z.string(), fieldTypeSchema).optional(),
  fieldLabels: z.record(z.string(), z.string().max(200)).optional(),
})
const relationshipInput = z.object({
  leftSourceId: z.string().min(1).max(100),
  leftField: z.string().min(1).max(200),
  rightSourceId: z.string().min(1).max(100),
  rightField: z.string().min(1).max(200),
})
const sourceParams = z.object({ sourceId: z.string().min(1).max(100) })
const uuidParams = z.object({ sourceId: z.uuid() })

type App = Parameters<FastifyPluginAsyncZod<RouteDeps>>[0]

export const registerBiSourceRoutes: FastifyPluginAsyncZod<RouteDeps> = async (app, deps) => {
  registerReads(app, deps)
  registerWrites(app, deps)
  registerRelationships(app, deps)
}

function registerReads(app: App, { ctx, guard }: RouteDeps) {
  app.get('/api/bi/sources', { preHandler: guard.requireAuth }, (request) => sources.listSources(ctx, currentUser(request)))

  app.get('/api/bi/sources/:sourceId', { preHandler: guard.requireAuth, schema: { params: sourceParams } }, (request) =>
    sources.getSource(ctx, currentUser(request), request.params.sourceId),
  )

  app.get('/api/bi/relationships', { preHandler: guard.requireAuth }, () => sources.listRelationships(ctx))
}

function registerWrites(app: App, { ctx, guard }: RouteDeps) {
  app.post('/api/bi/uploads', { preHandler: guard.requireAdmin }, async (request, reply) => {
    const file = await request.file()
    if (!file) throw new DomainError('VALIDATION_ERROR', 'Envie um arquivo.', 422)
    const data = await file.toBuffer()
    const uploaded = await sources.uploadSpreadsheet(ctx, currentUser(request), { filename: file.filename, mimetype: file.mimetype, data })
    return reply.status(201).send(uploaded)
  })

  app.post(
    '/api/bi/sources/preview',
    { preHandler: guard.requireAdmin, schema: { body: sourceInput.extend({ sourceId: z.uuid().optional(), name: z.string().max(100).default('') }) } },
    (request) => sources.previewSource(ctx, currentUser(request), request.body),
  )

  app.post('/api/bi/sources', { preHandler: guard.requireAdmin, schema: { body: sourceInput } }, async (request, reply) =>
    reply.status(201).send(await sources.createSource(ctx, currentUser(request), request.body)),
  )

  app.patch('/api/bi/sources/:sourceId', { preHandler: guard.requireAdmin, schema: { params: uuidParams, body: sourceUpdate } }, (request) =>
    sources.updateSource(ctx, currentUser(request), request.params.sourceId, request.body),
  )

  app.delete('/api/bi/sources/:sourceId', { preHandler: guard.requireAdmin, schema: { params: uuidParams } }, async (request, reply) => {
    await sources.deleteSource(ctx, currentUser(request), request.params.sourceId)
    return reply.status(204).send()
  })

  app.post('/api/bi/sources/:sourceId/refresh', { preHandler: guard.requireAdmin, schema: { params: uuidParams } }, async (request, reply) => {
    await sources.refreshSource(ctx, currentUser(request), request.params.sourceId)
    return reply.status(202).send()
  })
}

function registerRelationships(app: App, { ctx, guard }: RouteDeps) {
  app.post('/api/bi/relationships', { preHandler: guard.requireAdmin, schema: { body: relationshipInput } }, async (request, reply) =>
    reply.status(201).send(await sources.createRelationship(ctx, currentUser(request), request.body)),
  )

  app.delete(
    '/api/bi/relationships/:relationshipId',
    { preHandler: guard.requireAdmin, schema: { params: z.object({ relationshipId: z.uuid() }) } },
    async (request, reply) => {
      await sources.deleteRelationship(ctx, currentUser(request), request.params.relationshipId)
      return reply.status(204).send()
    },
  )
}
