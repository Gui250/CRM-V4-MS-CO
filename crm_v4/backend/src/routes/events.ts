import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import type { RouteDeps } from '../app.js'
import * as sessionModel from '../models/session.js'
import type { RealtimeEvent } from '../realtime/bus.js'
import { SESSION_COOKIE } from './auth-guard.js'

export const PING_INTERVAL_MS = 25_000

export const registerEventsRoute: FastifyPluginAsyncZod<RouteDeps> = async (app, { ctx, guard }) => {
  app.get('/api/events', { preHandler: guard.requireAuth }, async (request, reply) => {
    const token = request.cookies[SESSION_COOKIE]!
    reply.hijack()
    const res = reply.raw
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    })
    res.write(': connected\n\n')

    const send = (event: RealtimeEvent) => res.write(`event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`)
    const unsubscribe = ctx.bus.subscribe(send)

    // Re-checking the session on every ping cuts off disabled or logged-out users within 25 s.
    const ping = setInterval(() => {
      void sessionModel
        .findValid(ctx.db, token)
        .then((user) => (user ? res.write(': ping\n\n') : res.end()))
        .catch(() => res.end())
    }, PING_INTERVAL_MS)

    const cleanup = () => {
      clearInterval(ping)
      unsubscribe()
    }
    request.raw.on('close', cleanup)
    res.on('close', cleanup)
  })
}
