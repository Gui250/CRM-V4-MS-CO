import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import type { RouteDeps } from '../app.js'
import * as connection from '../controllers/connection.js'

export const registerConnectionRoutes: FastifyPluginAsyncZod<RouteDeps> = async (app, { ctx, guard }) => {
  app.get('/api/connection', { preHandler: guard.requireAuth }, () => connection.getStatus(ctx))
  app.post('/api/connection/connect', { preHandler: guard.requireAdmin }, () => connection.connect(ctx))
  app.post('/api/connection/logout', { preHandler: guard.requireAdmin }, () => connection.logout(ctx))
}
