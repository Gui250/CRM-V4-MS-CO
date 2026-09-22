import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import type { RouteDeps } from '../app.js'
import * as leads from '../controllers/leads.js'
import { currentUser } from './auth-guard.js'

const leadParams = z.object({ leadId: z.uuid() })

// A route table: each handler is a few lines of validation delegating to a controller.
// eslint-disable-next-line max-lines-per-function
export const registerLeadRoutes: FastifyPluginAsyncZod<RouteDeps> = async (app, { ctx, guard }) => {
  app.get(
    '/api/leads',
    { preHandler: guard.requireAuth, schema: { querystring: z.object({ contactId: z.uuid() }) } },
    (request) => leads.listContactLeads(ctx, request.query.contactId),
  )

  app.post(
    '/api/leads',
    {
      preHandler: guard.requireAuth,
      schema: { body: z.object({ pipelineId: z.uuid(), contactId: z.uuid(), stageId: z.uuid().optional() }) },
    },
    async (request, reply) => reply.status(201).send(await leads.createLead(ctx, currentUser(request), request.body)),
  )

  app.post(
    '/api/leads/:leadId/move',
    {
      preHandler: guard.requireAuth,
      schema: {
        params: leadParams,
        body: z.object({
          stageId: z.uuid(),
          beforeLeadId: z.uuid().nullable().optional(),
          lostReason: z.string().max(leads.LOST_REASON_MAX).optional(),
        }),
      },
    },
    (request) => leads.moveLead(ctx, currentUser(request), request.params.leadId, request.body),
  )

  app.get('/api/leads/:leadId', { preHandler: guard.requireAuth, schema: { params: leadParams } }, (request) =>
    leads.getLead(ctx, request.params.leadId),
  )

  app.patch(
    '/api/leads/:leadId',
    {
      preHandler: guard.requireAuth,
      schema: {
        params: leadParams,
        body: z
          .object({
            title: z.string().trim().max(120).nullable().optional(),
            valueCents: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).nullable().optional(),
            assigneeId: z.uuid().nullable().optional(),
            notes: z.string().max(5000).nullable().optional(),
          })
          .refine((body) => Object.keys(body).length > 0, 'Informe o que alterar.'),
      },
    },
    (request) => {
      const { title, ...rest } = request.body
      return leads.updateLead(ctx, request.params.leadId, { ...rest, ...(title === undefined ? {} : { title: title || null }) })
    },
  )

  app.delete('/api/leads/:leadId', { preHandler: guard.requireAuth, schema: { params: leadParams } }, async (request, reply) => {
    await leads.deleteLead(ctx, request.params.leadId)
    return reply.status(204).send()
  })
}
