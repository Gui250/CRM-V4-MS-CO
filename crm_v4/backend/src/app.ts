import cookie from '@fastify/cookie'
import multipart from '@fastify/multipart'
import rateLimit from '@fastify/rate-limit'
import Fastify, { type FastifyError, type FastifyServerOptions } from 'fastify'
import {
  hasZodFastifySchemaValidationErrors,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod'
import type { AppContext } from './context.js'
import { DomainError } from './lib/errors.js'
import { registerAiAgentRoutes } from './routes/ai-agents.js'
import { registerAiProviderRoutes } from './routes/ai-providers.js'
import { createAuthGuard } from './routes/auth-guard.js'
import { registerAuthRoutes } from './routes/auth.js'
import { registerBiQueryRoutes } from './routes/bi-query.js'
import { registerBiReportRoutes } from './routes/bi-reports.js'
import { registerBiSourceRoutes } from './routes/bi-sources.js'
import { registerConnectionRoutes } from './routes/connection.js'
import { registerContactRoutes } from './routes/contacts.js'
import { registerConversationRoutes } from './routes/conversations.js'
import { registerEventsRoute } from './routes/events.js'
import { registerFlowRoutes } from './routes/flows.js'
import { registerLeadRoutes } from './routes/leads.js'
import { registerMessageRoutes } from './routes/messages.js'
import { registerPipelineRoutes } from './routes/pipelines.js'
import { registerRunRoutes } from './routes/runs.js'
import { registerUserRoutes } from './routes/users.js'
import { registerWebhookRoutes } from './routes/webhooks.js'

export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024

const ROUTES = [
  registerAuthRoutes,
  registerUserRoutes,
  registerConnectionRoutes,
  registerConversationRoutes,
  registerMessageRoutes,
  registerPipelineRoutes,
  registerLeadRoutes,
  registerEventsRoute,
  registerWebhookRoutes,
  registerAiProviderRoutes,
  registerAiAgentRoutes,
  registerRunRoutes,
  registerContactRoutes,
  registerFlowRoutes,
  registerBiSourceRoutes,
  registerBiQueryRoutes,
  registerBiReportRoutes,
]

export async function buildApp(ctx: Omit<AppContext, 'log'>, options: FastifyServerOptions = {}) {
  const app = Fastify(options).withTypeProvider<ZodTypeProvider>()
  const fullCtx: AppContext = { ...ctx, log: app.log }

  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)
  app.decorateRequest('user', null)
  await app.register(cookie)
  await app.register(multipart, { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } })
  await app.register(rateLimit, { global: false })

  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (error instanceof DomainError) {
      // `details` is attached by withDetails() (BI conflicts); undefined is dropped from the JSON.
      const { details } = error as DomainError & { details?: unknown }
      return reply.status(error.httpStatus).send({ ...error.extra, details, code: error.code, message: error.message })
    }
    if (hasZodFastifySchemaValidationErrors(error)) {
      return reply.status(422).send({ code: 'VALIDATION_ERROR', message: 'Dados inválidos.', details: error.validation })
    }
    const status = error.statusCode ?? 500
    if (status === 429) {
      return reply.status(429).send({ code: 'RATE_LIMITED', message: 'Muitas tentativas. Aguarde um minuto.' })
    }
    if (status < 500) {
      return reply.status(status).send({ code: error.code ?? 'BAD_REQUEST', message: error.message })
    }
    request.log.error({ err: error }, 'unhandled error')
    return reply.status(500).send({ code: 'INTERNAL_ERROR', message: 'Erro inesperado. Tente novamente.' })
  })

  const guard = createAuthGuard(fullCtx)
  const deps = { ctx: fullCtx, guard }
  for (const routePlugin of ROUTES) await app.register(routePlugin, deps)
  return app
}

export type App = Awaited<ReturnType<typeof buildApp>>
export type RouteDeps = { ctx: AppContext; guard: ReturnType<typeof createAuthGuard> }
