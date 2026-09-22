import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import type { RouteDeps } from '../app.js'
import * as leads from '../controllers/leads.js'
import * as pipelines from '../controllers/pipelines.js'
import { currentUser } from './auth-guard.js'

const booleanQuery = z.enum(['true', 'false']).optional().transform((value) => value === 'true')
const pipelineParams = z.object({ pipelineId: z.uuid() })
const stageParams = pipelineParams.extend({ stageId: z.uuid() })
const pipelineName = z.string().trim().min(1).max(60)
const stageName = z.string().trim().min(1).max(40)
const stageColor = z.enum(['gray', 'red', 'orange', 'amber', 'green', 'teal', 'blue', 'violet'])
const stageKind = z.enum(['open', 'won', 'lost'])
const notEmpty = (body: object) => Object.keys(body).length > 0
const boardQuery = {
  assignee: z.union([z.literal('me'), z.literal('none'), z.uuid()]).optional(),
  search: z.string().max(100).optional(),
}

// A route table: each handler is a few lines of validation delegating to a controller.
// eslint-disable-next-line max-lines-per-function
export const registerPipelineRoutes: FastifyPluginAsyncZod<RouteDeps> = async (app, { ctx, guard }) => {
  app.get(
    '/api/pipelines',
    { preHandler: guard.requireAuth, schema: { querystring: z.object({ includeArchived: booleanQuery }) } },
    (request) => pipelines.listPipelines(ctx, request.query),
  )

  app.get(
    '/api/pipelines/:pipelineId/board',
    { preHandler: guard.requireAuth, schema: { params: pipelineParams, querystring: z.object(boardQuery) } },
    (request) => leads.getBoard(ctx, currentUser(request), request.params.pipelineId, request.query),
  )

  app.get(
    '/api/pipelines/:pipelineId/stages/:stageId/leads',
    {
      preHandler: guard.requireAuth,
      schema: {
        params: stageParams,
        querystring: z.object({
          ...boardQuery,
          cursor: z.string().max(200).optional(),
          limit: z.coerce.number().int().min(1).max(100).default(leads.BOARD_PAGE_SIZE),
        }),
      },
    },
    (request) =>
      leads.listStageLeads(ctx, currentUser(request), request.params.pipelineId, request.params.stageId, request.query),
  )

  // Structure (admins only, FR-019).

  app.post(
    '/api/pipelines',
    { preHandler: guard.requireAdmin, schema: { body: z.object({ name: pipelineName }) } },
    async (request, reply) => reply.status(201).send(await pipelines.createPipeline(ctx, request.body.name)),
  )

  app.patch(
    '/api/pipelines/:pipelineId',
    {
      preHandler: guard.requireAdmin,
      schema: {
        params: pipelineParams,
        body: z
          .object({ name: pipelineName.optional(), isEntry: z.boolean().optional(), archived: z.boolean().optional() })
          .refine(notEmpty, 'Informe o que alterar.'),
      },
    },
    (request) => pipelines.updatePipeline(ctx, request.params.pipelineId, request.body),
  )

  app.post(
    '/api/pipelines/:pipelineId/stages',
    {
      preHandler: guard.requireAdmin,
      schema: { params: pipelineParams, body: z.object({ name: stageName, color: stageColor.optional(), kind: stageKind.optional() }) },
    },
    async (request, reply) => reply.status(201).send(await pipelines.createStage(ctx, request.params.pipelineId, request.body)),
  )

  app.put(
    '/api/pipelines/:pipelineId/stages/order',
    {
      preHandler: guard.requireAdmin,
      schema: { params: pipelineParams, body: z.object({ stageIds: z.array(z.uuid()).min(1).max(20) }) },
    },
    (request) => pipelines.reorderStages(ctx, request.params.pipelineId, request.body.stageIds),
  )

  app.patch(
    '/api/pipelines/:pipelineId/stages/:stageId',
    {
      preHandler: guard.requireAdmin,
      schema: {
        params: stageParams,
        body: z
          .object({ name: stageName.optional(), color: stageColor.optional(), kind: stageKind.optional() })
          .refine(notEmpty, 'Informe o que alterar.'),
      },
    },
    (request) => pipelines.updateStage(ctx, request.params.pipelineId, request.params.stageId, request.body),
  )

  app.delete(
    '/api/pipelines/:pipelineId/stages/:stageId',
    {
      preHandler: guard.requireAdmin,
      schema: { params: stageParams, querystring: z.object({ moveToStageId: z.uuid().optional() }) },
    },
    async (request, reply) => {
      const { pipelineId, stageId } = request.params
      await pipelines.deleteStage(ctx, currentUser(request), pipelineId, stageId, request.query.moveToStageId)
      return reply.status(204).send()
    },
  )
}
