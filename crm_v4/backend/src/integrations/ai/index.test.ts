import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { normalizeTurns, parseToolArgs, requestJson } from './index.js'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

describe('requestJson', () => {
  const schema = z.object({ ok: z.boolean() })

  it('returns the parsed body', async () => {
    const doFetch = vi.fn().mockResolvedValue(json({ ok: true }))
    await expect(requestJson(doFetch, 'https://x', {}, schema)).resolves.toEqual({ ok: true })
  })

  it.each([
    [401, 'chave inválida ou sem permissão'],
    [429, 'limite de uso atingido'],
    [500, 'HTTP 500'],
  ])('maps HTTP %i to a readable AI_PROVIDER_ERROR', async (status, detail) => {
    const doFetch = vi.fn().mockResolvedValue(json({}, status))
    await expect(requestJson(doFetch, 'https://x', {}, schema)).rejects.toMatchObject({
      code: 'AI_PROVIDER_ERROR',
      httpStatus: 502,
      message: `O provedor de IA não respondeu corretamente (${detail}).`,
    })
  })

  it('rejects bodies that do not match the schema', async () => {
    const doFetch = vi.fn().mockResolvedValue(json({ ok: 'yes' }))
    await expect(requestJson(doFetch, 'https://x', {}, schema)).rejects.toMatchObject({ message: expect.stringContaining('resposta inválida') })
  })

  it('reports timeouts', async () => {
    const doFetch = vi.fn().mockRejectedValue(Object.assign(new Error('t'), { name: 'TimeoutError' }))
    await expect(requestJson(doFetch, 'https://x', {}, schema)).rejects.toMatchObject({ message: expect.stringContaining('tempo esgotado') })
  })

  it('reports network failures', async () => {
    const doFetch = vi.fn().mockRejectedValue(new TypeError('fetch failed'))
    await expect(requestJson(doFetch, 'https://x', {}, schema)).rejects.toMatchObject({ message: expect.stringContaining('sem resposta') })
  })
})

describe('normalizeTurns', () => {
  it('merges consecutive turns of the same role', () => {
    expect(
      normalizeTurns([
        { role: 'user', text: 'oi' },
        { role: 'user', text: 'tudo bem?' },
        { role: 'assistant', text: 'Olá!' },
      ]),
    ).toEqual([
      { role: 'user', text: 'oi\ntudo bem?' },
      { role: 'assistant', text: 'Olá!' },
    ])
  })

  it('makes the history start with the user', () => {
    expect(normalizeTurns([{ role: 'assistant', text: 'Bem-vindo!' }, { role: 'user', text: 'oi' }])[0]).toEqual({
      role: 'user',
      text: '(início da conversa)',
    })
  })

  it('does not mutate the input', () => {
    const turns = [
      { role: 'user' as const, text: 'a' },
      { role: 'user' as const, text: 'b' },
    ]
    normalizeTurns(turns)
    expect(turns[0]?.text).toBe('a')
  })
})

describe('parseToolArgs', () => {
  it('accepts objects and JSON strings, and falls back to {}', () => {
    expect(parseToolArgs({ motivo: 'x' })).toEqual({ motivo: 'x' })
    expect(parseToolArgs('{"motivo":"x"}')).toEqual({ motivo: 'x' })
    expect(parseToolArgs('not json')).toEqual({})
    expect(parseToolArgs('[1]')).toEqual({})
    expect(parseToolArgs(undefined)).toEqual({})
  })
})
