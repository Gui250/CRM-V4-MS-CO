import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import type { RouteDeps } from '../app.js'
import * as runs from '../controllers/runs.js'

const idParams = z.object({ id: z.uuid() })

export const registerRunRoutes: FastifyPluginAsyncZod<RouteDeps> = async (app, { ctx, guard }) => {
  app.get(
    '/api/flows/:id/runs',
    {
      preHandler: guard.requireAdmin,
      schema: {
        params: idParams,
        querystring: z.object({
          status: z.enum(['running', 'waiting', 'completed', 'failed', 'cancelled']).optional(),
          cursor: z.string().max(200).optional(),
          limit: z.coerce.number().int().min(1).max(100).default(50),
        }),
      },
    },
    (request) => runs.listByFlow(ctx, request.params.id, request.query),
  )

  // Attendants see the runs of the conversations they open (FR-029).
  app.get('/api/runs/:id', { preHandler: guard.requireAuth, schema: { params: idParams } }, (request) =>
    runs.getDetail(ctx, request.params.id),
  )

  app.post('/api/runs/:id/cancel', { preHandler: guard.requireAuth, schema: { params: idParams } }, (request) =>
    runs.cancel(ctx, request.params.id),
  )
}
