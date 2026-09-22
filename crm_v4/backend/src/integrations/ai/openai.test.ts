import { describe, expect, it, vi } from 'vitest'
import { createOpenAiClient } from './openai.js'
import { AGENT_TOOLS } from './tools.js'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
const input = {
  apiKey: 'sk-secret-key',
  model: 'gpt-5',
  system: 'Seja educado.',
  turns: [{ role: 'user' as const, text: 'oi' }],
  tools: AGENT_TOOLS,
  signal: AbortSignal.timeout(1_000),
}

function lastRequest(doFetch: ReturnType<typeof vi.fn>) {
  const [url, init] = doFetch.mock.calls.at(-1) as [string, RequestInit]
  return { url, init, body: init.body ? JSON.parse(init.body as string) : undefined }
}

describe('openai client', () => {
  it('lists models with a bearer token', async () => {
    const doFetch = vi.fn().mockResolvedValue(json({ data: [{ id: 'gpt-5' }, { id: 'gpt-4.1' }] }))
    await expect(createOpenAiClient(doFetch).listModels('sk-secret-key')).resolves.toEqual(['gpt-4.1', 'gpt-5'])
    const { url, init } = lastRequest(doFetch)
    expect(url).toBe('https://api.openai.com/v1/models')
    expect(init.headers).toMatchObject({ Authorization: 'Bearer sk-secret-key' })
  })

  it('sends instructions, turns and strict function tools to the Responses API', async () => {
    const doFetch = vi.fn().mockResolvedValue(json({ output: [] }))
    await createOpenAiClient(doFetch).generate(input)
    const { url, body } = lastRequest(doFetch)
    expect(url).toBe('https://api.openai.com/v1/responses')
    expect(body).toMatchObject({
      model: 'gpt-5',
      instructions: 'Seja educado.',
      input: [{ role: 'user', content: 'oi' }],
      store: false,
    })
    expect(body.tools[0]).toMatchObject({ type: 'function', name: 'transferir_para_humano', strict: true })
  })

  it('parses text and function calls, ignoring other output items', async () => {
    const doFetch = vi.fn().mockResolvedValue(
      json({
        output: [
          { type: 'reasoning', summary: [] },
          { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Vou transferir.' }] },
          { type: 'function_call', name: 'transferir_para_humano', arguments: '{"motivo":"pediu humano"}', call_id: 'c1' },
        ],
      }),
    )
    await expect(createOpenAiClient(doFetch).generate(input)).resolves.toEqual({
      text: 'Vou transferir.',
      toolCalls: [{ name: 'transferir_para_humano', args: { motivo: 'pediu humano' } }],
    })
  })

  it('fails without leaking the key', async () => {
    const doFetch = vi.fn().mockResolvedValue(json({ error: { message: 'Incorrect API key sk-secret-key' } }, 401))
    const error = await createOpenAiClient(doFetch)
      .generate(input)
      .catch((e: Error) => e)
    expect(error).toMatchObject({ code: 'AI_PROVIDER_ERROR' })
    expect((error as Error).message).not.toContain('sk-secret-key')
  })
})
