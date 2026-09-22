import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import type { RouteDeps } from '../app.js'
import * as messages from '../controllers/messages.js'

const idParams = z.object({ id: z.uuid() })
// Only formats browsers render without running code are shown inline; everything else downloads.
const INLINE_MIME = /^(image\/(jpeg|png|webp|gif)|audio\/[\w.+-]+|video\/[\w.+-]+)$/

// RFC 5987 so accented Brazilian filenames survive the header.
const contentDisposition = (kind: 'inline' | 'attachment', filename: string | null) =>
  filename ? `${kind}; filename*=UTF-8''${encodeURIComponent(filename)}` : kind

export const registerMessageRoutes: FastifyPluginAsyncZod<RouteDeps> = async (app, { ctx, guard }) => {
  app.post(
    '/api/messages/:id/retry',
    { preHandler: guard.requireAuth, schema: { params: idParams } },
    async (request, reply) => reply.status(202).send(await messages.retry(ctx, request.params.id)),
  )

  app.get(
    '/api/messages/:id/media',
    { preHandler: guard.requireAuth, schema: { params: idParams } },
    async (request, reply) => {
      const media = await messages.getMedia(ctx, request.params.id)
      return reply
        .header('Content-Type', media.mime)
        .header('Content-Disposition', contentDisposition(INLINE_MIME.test(media.mime) ? 'inline' : 'attachment', media.filename))
        // Media comes from outside (WhatsApp contacts); never let it run in the panel's origin.
        .header('Content-Security-Policy', "default-src 'none'; sandbox")
        .header('Cache-Control', 'private, max-age=86400')
        .header('X-Content-Type-Options', 'nosniff')
        .send(media.stream)
    },
  )
}
