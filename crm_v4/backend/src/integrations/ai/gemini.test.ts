import { describe, expect, it, vi } from 'vitest'
import { createGeminiClient } from './gemini.js'
import { AGENT_TOOLS } from './tools.js'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
const input = {
  apiKey: 'gm-secret-key',
  model: 'gemini-2.5-flash',
  system: 'Seja educado.',
  turns: [
    { role: 'assistant' as const, text: 'Bem-vindo!' },
    { role: 'user' as const, text: 'oi' },
    { role: 'user' as const, text: 'preço?' },
  ],
  tools: AGENT_TOOLS,
  signal: AbortSignal.timeout(1_000),
}

function lastRequest(doFetch: ReturnType<typeof vi.fn>) {
  const [url, init] = doFetch.mock.calls.at(-1) as [string, RequestInit]
  return { url, init, body: init.body ? JSON.parse(init.body as string) : undefined }
}

describe('gemini client', () => {
  it('lists only models that generate content, without the models/ prefix', async () => {
    const doFetch = vi.fn().mockResolvedValue(
      json({
        models: [
          { name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent'] },
          { name: 'models/text-embedding-004', supportedGenerationMethods: ['embedContent'] },
        ],
      }),
    )
    await expect(createGeminiClient(doFetch).listModels('gm-secret-key')).resolves.toEqual(['gemini-2.5-flash'])
    expect(lastRequest(doFetch).init.headers).toMatchObject({ 'x-goog-api-key': 'gm-secret-key' })
  })

  it('sends system instruction, normalized turns with the model role and function declarations', async () => {
    const doFetch = vi.fn().mockResolvedValue(json({ candidates: [{ content: { parts: [{ text: 'Olá' }] } }] }))
    await createGeminiClient(doFetch).generate(input)
    const { url, body } = lastRequest(doFetch)
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent')
    expect(body.systemInstruction).toEqual({ parts: [{ text: 'Seja educado.' }] })
    expect(body.contents).toEqual([
      { role: 'user', parts: [{ text: '(início da conversa)' }] },
      { role: 'model', parts: [{ text: 'Bem-vindo!' }] },
      { role: 'user', parts: [{ text: 'oi\npreço?' }] },
    ])
    const declaration = body.tools[0].functionDeclarations[0]
    expect(declaration.name).toBe('transferir_para_humano')
    expect(declaration.parameters).not.toHaveProperty('additionalProperties')
  })

  it('parses text and function calls', async () => {
    const doFetch = vi.fn().mockResolvedValue(
      json({
        candidates: [
          { content: { parts: [{ text: 'Até logo!' }, { functionCall: { name: 'encerrar_atendimento', args: { resumo: 'ok' } } }] } },
        ],
      }),
    )
    await expect(createGeminiClient(doFetch).generate(input)).resolves.toEqual({
      text: 'Até logo!',
      toolCalls: [{ name: 'encerrar_atendimento', args: { resumo: 'ok' } }],
    })
  })

  it('treats a response without candidates as an error', async () => {
    const doFetch = vi.fn().mockResolvedValue(json({ promptFeedback: { blockReason: 'SAFETY' } }))
    await expect(createGeminiClient(doFetch).generate(input)).rejects.toMatchObject({
      code: 'AI_PROVIDER_ERROR',
      message: expect.stringContaining('resposta bloqueada ou vazia'),
    })
  })
})
