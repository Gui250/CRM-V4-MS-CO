import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { Readable } from 'node:stream'
import { z } from 'zod'
import type { RouteDeps } from '../app.js'
import * as query from '../controllers/bi-query.js'
import { calculatedFieldSchema, filterSchema, queryRequestSchema } from '../models/bi/definition.js'
import { currentUser } from './auth-guard.js'

const rowsBody = z.object({
  sourceId: z.string().min(1).max(100),
  filters: z.array(filterSchema).max(50).default([]),
  calculatedFields: z.array(calculatedFieldSchema).max(50).default([]),
})

// RFC 5987 so accented source names survive the header.
const attachment = (filename: string) => `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`

export const registerBiQueryRoutes: FastifyPluginAsyncZod<RouteDeps> = async (app, { ctx, guard }) => {
  app.post('/api/bi/query', { preHandler: guard.requireAuth, schema: { body: queryRequestSchema } }, (request) =>
    query.runVisualQuery(ctx, currentUser(request), request.body),
  )

  app.post(
    '/api/bi/rows',
    { preHandler: guard.requireAuth, schema: { body: rowsBody.extend({ page: z.number().int().min(1).default(1) }) } },
    (request) => query.listSourceRows(ctx, currentUser(request), request.body),
  )

  app.post('/api/bi/rows.csv', { preHandler: guard.requireAuth, schema: { body: rowsBody } }, async (request, reply) => {
    const { name, chunks } = await query.sourceRowsCsv(ctx, currentUser(request), request.body)
    const date = new Date().toISOString().slice(0, 10)
    return reply
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', attachment(`dados-${name}-${date}.csv`))
      .send(Readable.from(chunks))
  })

  app.post(
    '/api/bi/suggest',
    { preHandler: guard.requireAuth, schema: { body: z.object({ sourceId: z.string().min(1).max(100) }) } },
    (request) => query.suggestReportPage(ctx, currentUser(request), request.body.sourceId),
  )
}
