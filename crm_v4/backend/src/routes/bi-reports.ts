import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import type { RouteDeps } from '../app.js'
import * as reports from '../controllers/bi-reports.js'
import { reportDefinitionSchema } from '../models/bi/definition.js'
import { TEMPLATE_IDS } from '../models/bi/templates.js'
import { currentUser } from './auth-guard.js'

const params = z.object({ reportId: z.uuid() })
const name = z.string().trim().min(1).max(100)

export const registerBiReportRoutes: FastifyPluginAsyncZod<RouteDeps> = async (app, { ctx, guard }) => {
  app.get('/api/bi/reports', { preHandler: guard.requireAuth }, (request) => reports.listReports(ctx, currentUser(request)))

  app.post(
    '/api/bi/reports',
    {
      preHandler: guard.requireAuth,
      schema: { body: z.object({ name, templateId: z.enum(TEMPLATE_IDS).optional(), duplicateOf: z.uuid().optional() }) },
    },
    async (request, reply) => reply.status(201).send(await reports.createReport(ctx, currentUser(request), request.body)),
  )

  app.get('/api/bi/reports/:reportId', { preHandler: guard.requireAuth, schema: { params } }, (request) =>
    reports.getReport(ctx, currentUser(request), request.params.reportId),
  )

  app.put(
    '/api/bi/reports/:reportId',
    {
      preHandler: guard.requireAuth,
      schema: {
        params,
        body: z.object({ name, definition: reportDefinitionSchema, version: z.number().int().min(1), force: z.boolean().default(false) }),
      },
    },
    (request) => reports.saveReport(ctx, currentUser(request), request.params.reportId, request.body),
  )

  app.delete('/api/bi/reports/:reportId', { preHandler: guard.requireAuth, schema: { params } }, async (request, reply) => {
    await reports.deleteReport(ctx, currentUser(request), request.params.reportId)
    return reply.status(204).send()
  })

  app.get('/api/bi/reports/:reportId/shares', { preHandler: guard.requireAuth, schema: { params } }, (request) =>
    reports.listShares(ctx, currentUser(request), request.params.reportId),
  )

  app.put(
    '/api/bi/reports/:reportId/shares',
    {
      preHandler: guard.requireAuth,
      schema: { params, body: z.array(z.object({ userId: z.uuid(), permission: z.enum(['edit', 'view']) })).max(200) },
    },
    (request) => reports.replaceShares(ctx, currentUser(request), request.params.reportId, request.body),
  )
}
