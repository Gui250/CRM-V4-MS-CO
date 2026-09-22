import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import type { RouteDeps } from '../app.js'
import * as handling from '../controllers/handling.js'
import { currentUser } from './auth-guard.js'

const idParams = z.object({ id: z.uuid() })

export const registerContactRoutes: FastifyPluginAsyncZod<RouteDeps> = async (app, { ctx, guard }) => {
  app.put('/api/contacts/:id/automation-opt-out', { preHandler: guard.requireAuth, schema: { params: idParams } }, (request) =>
    handling.setOptOut(ctx, currentUser(request), request.params.id),
  )

  app.delete('/api/contacts/:id/automation-opt-out', { preHandler: guard.requireAuth, schema: { params: idParams } }, (request) =>
    handling.clearOptOut(ctx, request.params.id),
  )
}
