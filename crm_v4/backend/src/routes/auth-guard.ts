import type { FastifyReply, FastifyRequest } from 'fastify'
import type { AppContext } from '../context.js'
import { forbidden, unauthorized } from '../lib/errors.js'
import * as sessionModel from '../models/session.js'
import type { User } from '../models/user.js'

export const SESSION_COOKIE = 'v4_session'

declare module 'fastify' {
  interface FastifyRequest {
    user: User | null
  }
}

export function createAuthGuard(ctx: AppContext) {
  async function requireAuth(request: FastifyRequest, _reply: FastifyReply) {
    const token = request.cookies[SESSION_COOKIE]
    const user = token ? await sessionModel.findValid(ctx.db, token) : null
    if (!user) throw unauthorized()
    request.user = user
  }

  async function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
    await requireAuth(request, reply)
    if (request.user?.role !== 'admin') throw forbidden()
  }

  return { requireAuth, requireAdmin }
}

/** Non-null user inside handlers protected by requireAuth. */
export function currentUser(request: FastifyRequest): User {
  if (!request.user) throw unauthorized()
  return request.user
}
