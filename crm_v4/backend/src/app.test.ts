import { describe, expect, it } from 'vitest'
import { buildApp } from './app.js'
import { DomainError } from './lib/errors.js'
import { fakeContext } from './test/context.js'

async function appWithFailingRoutes() {
  const app = await buildApp(fakeContext().ctx, { logger: false })
  app.get('/boom-domain', async () => {
    throw new DomainError('SOMETHING', 'Mensagem', 418)
  })
  app.get('/boom', async () => {
    throw new Error('segredo interno')
  })
  await app.ready()
  return app
}

describe('error handler', () => {
  it('maps DomainError to its status with { code, message }', async () => {
    const app = await appWithFailingRoutes()
    const response = await app.inject({ url: '/boom-domain' })
    expect(response.statusCode).toBe(418)
    expect(response.json()).toEqual({ code: 'SOMETHING', message: 'Mensagem' })
  })

  it('hides unexpected errors behind a generic 500', async () => {
    const app = await appWithFailingRoutes()
    const response = await app.inject({ url: '/boom' })
    expect(response.statusCode).toBe(500)
    expect(response.json()).toEqual({ code: 'INTERNAL_ERROR', message: 'Erro inesperado. Tente novamente.' })
  })

  it('keeps Fastify client errors (e.g. malformed JSON) as 4xx', async () => {
    const app = await appWithFailingRoutes()
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { 'content-type': 'application/json' },
      payload: '{nope',
    })
    expect(response.statusCode).toBe(400)
  })
})
