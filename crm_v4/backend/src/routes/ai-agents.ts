import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import type { RouteDeps } from '../app.js'
import * as agents from '../controllers/ai-agents.js'
import { currentUser } from './auth-guard.js'

const fields = {
  name: z.string().trim().min(2).max(60),
  providerId: z.uuid(),
  model: z.string().trim().min(1).max(100),
  instructions: z.string().trim().min(1).max(8000),
  historySize: z.number().int().min(5).max(50),
}
const idParams = z.object({ id: z.uuid() })

export const registerAiAgentRoutes: FastifyPluginAsyncZod<RouteDeps> = async (app, { ctx, guard }) => {
  app.get('/api/ai-agents', { preHandler: guard.requireAdmin }, () => agents.list(ctx))

  app.post(
    '/api/ai-agents',
    { preHandler: guard.requireAdmin, schema: { body: z.object({ ...fields, historySize: fields.historySize.default(20) }) } },
    async (request, reply) => reply.status(201).send(await agents.create(ctx, currentUser(request), request.body)),
  )

  app.patch(
    '/api/ai-agents/:id',
    {
      preHandler: guard.requireAdmin,
      schema: {
        params: idParams,
        body: z
          .object({ ...fields, isActive: z.boolean() })
          .partial()
          .refine((body) => Object.keys(body).length > 0, 'Informe ao menos um campo.'),
      },
    },
    (request) => agents.update(ctx, request.params.id, request.body),
  )

  app.delete('/api/ai-agents/:id', { preHandler: guard.requireAdmin, schema: { params: idParams } }, async (request, reply) => {
    await agents.remove(ctx, request.params.id)
    return reply.status(204).send()
  })
}
