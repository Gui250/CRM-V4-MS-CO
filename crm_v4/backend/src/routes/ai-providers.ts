import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import type { RouteDeps } from '../app.js'
import * as providers from '../controllers/ai-providers.js'

const name = z.string().trim().min(2).max(60)
const apiKey = z.string().trim().min(10).max(500)
const idParams = z.object({ id: z.uuid() })

// Bodies carry API keys: Fastify does not log request bodies, and responses only carry keyHint.
export const registerAiProviderRoutes: FastifyPluginAsyncZod<RouteDeps> = async (app, { ctx, guard }) => {
  app.get('/api/ai-providers', { preHandler: guard.requireAdmin }, () => providers.list(ctx))

  app.post(
    '/api/ai-providers',
    {
      preHandler: guard.requireAdmin,
      schema: { body: z.object({ name, vendor: z.enum(['openai', 'anthropic', 'gemini']), apiKey }) },
    },
    async (request, reply) => reply.status(201).send(await providers.create(ctx, request.body)),
  )

  app.patch(
    '/api/ai-providers/:id',
    {
      preHandler: guard.requireAdmin,
      schema: {
        params: idParams,
        body: z.object({ name: name.optional(), apiKey: apiKey.optional() }).refine((b) => b.name !== undefined || b.apiKey !== undefined, 'Informe nome ou chave.'),
      },
    },
    (request) => providers.update(ctx, request.params.id, request.body),
  )

  app.delete('/api/ai-providers/:id', { preHandler: guard.requireAdmin, schema: { params: idParams } }, async (request, reply) => {
    await providers.remove(ctx, request.params.id)
    return reply.status(204).send()
  })

  app.post('/api/ai-providers/:id/test', { preHandler: guard.requireAdmin, schema: { params: idParams } }, (request) =>
    providers.retest(ctx, request.params.id),
  )
}
