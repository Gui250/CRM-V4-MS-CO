import type { FastifyReply } from 'fastify'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import type { RouteDeps } from '../app.js'
import * as auth from '../controllers/auth.js'
import { toUserDto } from '../controllers/dto.js'
import { SESSION_TTL_MS } from '../models/session.js'
import { currentUser, SESSION_COOKIE } from './auth-guard.js'

const AUTH_RATE_LIMIT = { rateLimit: { max: 10, timeWindow: '1 minute' } }

const signupBody = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.email().max(254),
  password: z.string().min(8).max(128),
})

const loginBody = z.object({ email: z.email(), password: z.string().min(1).max(128) })

export const registerAuthRoutes: FastifyPluginAsyncZod<RouteDeps> = async (app, { ctx, guard }) => {
  const setSessionCookie = (reply: FastifyReply, token: string) =>
    reply.setCookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: ctx.config.SESSION_COOKIE_SECURE,
      path: '/',
      maxAge: SESSION_TTL_MS / 1000,
    })

  app.post('/api/auth/signup', { schema: { body: signupBody }, config: AUTH_RATE_LIMIT }, async (request, reply) => {
    const { user, sessionToken } = await auth.signup(ctx, request.body)
    if (sessionToken) setSessionCookie(reply, sessionToken)
    return reply.status(201).send(toUserDto(user))
  })

  app.post('/api/auth/login', { schema: { body: loginBody }, config: AUTH_RATE_LIMIT }, async (request, reply) => {
    const { user, sessionToken } = await auth.login(ctx, request.body)
    setSessionCookie(reply, sessionToken)
    return toUserDto(user)
  })

  app.post('/api/auth/logout', async (request, reply) => {
    const token = request.cookies[SESSION_COOKIE]
    if (token) await auth.logout(ctx, token)
    reply.clearCookie(SESSION_COOKIE, { path: '/' })
    return reply.status(204).send()
  })

  app.get('/api/auth/me', { preHandler: guard.requireAuth }, async (request) =>
    toUserDto(currentUser(request)),
  )
}
