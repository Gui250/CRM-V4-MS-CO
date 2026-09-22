import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import type { RouteDeps } from '../app.js'
import { toUserDto } from '../controllers/dto.js'
import * as users from '../controllers/users.js'
import { currentUser } from './auth-guard.js'

const status = z.enum(['pending', 'active', 'disabled'])
const role = z.enum(['admin', 'attendant'])

export const registerUserRoutes: FastifyPluginAsyncZod<RouteDeps> = async (app, { ctx, guard }) => {
  app.get(
    '/api/users',
    { preHandler: guard.requireAdmin, schema: { querystring: z.object({ status: status.optional() }) } },
    async (request) => {
      const list = await users.list(ctx, currentUser(request), request.query)
      return list.map((user) => toUserDto(user))
    },
  )

  app.get('/api/users/assignable', { preHandler: guard.requireAuth }, () => users.listAssignable(ctx))

  app.patch(
    '/api/users/:id',
    {
      preHandler: guard.requireAdmin,
      schema: {
        params: z.object({ id: z.uuid() }),
        body: z
          .object({ status: status.optional(), role: role.optional() })
          .refine((body) => body.status !== undefined || body.role !== undefined, 'Informe status ou role.'),
      },
    },
    async (request) => {
      const user = await users.update(ctx, currentUser(request), request.params.id, request.body)
      return toUserDto(user)
    },
  )
}
