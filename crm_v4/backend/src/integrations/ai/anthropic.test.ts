import Anthropic from '@anthropic-ai/sdk'
import { describe, expect, it, vi } from 'vitest'
import { createAnthropicClient } from './anthropic.js'
import { AGENT_TOOLS } from './tools.js'

const input = {
  apiKey: 'sk-ant-secret',
  model: 'claude-sonnet-5',
  system: 'Seja educado.',
  turns: [
    { role: 'assistant' as const, text: 'Bem-vindo!' },
    { role: 'user' as const, text: 'oi' },
  ],
  tools: AGENT_TOOLS,
  signal: AbortSignal.timeout(1_000),
}

function fakeClient(create: ReturnType<typeof vi.fn>, models: string[] = []) {
  return {
    messages: { create },
    models: {
      list: vi.fn(async function* () {
        for (const id of models) yield { id }
      }),
    },
  }
}

const message = (content: unknown[], stop_reason = 'end_turn') => ({ content, stop_reason })

describe('anthropic client', () => {
  it('lists models through the paginated iterator, with the key given', async () => {
    const make = vi.fn(() => fakeClient(vi.fn(), ['claude-sonnet-5', 'claude-opus-5']))
    await expect(createAnthropicClient(make as never).listModels('sk-ant-secret')).resolves.toEqual(['claude-opus-5', 'claude-sonnet-5'])
    expect(make).toHaveBeenCalledWith('sk-ant-secret')
  })

  it('sends system, normalized turns and tools with input_schema, passing the abort signal', async () => {
    const create = vi.fn().mockResolvedValue(message([{ type: 'text', text: 'Olá!' }]))
    await createAnthropicClient(() => fakeClient(create) as never).generate(input)
    const [body, options] = create.mock.calls[0]!
    expect(body).toMatchObject({
      model: 'claude-sonnet-5',
      system: 'Seja educado.',
      max_tokens: 1024,
      messages: [
        { role: 'user', content: '(início da conversa)' },
        { role: 'assistant', content: 'Bem-vindo!' },
        { role: 'user', content: 'oi' },
      ],
    })
    expect(body).not.toHaveProperty('thinking')
    expect(body.tools[0]).toEqual({ name: AGENT_TOOLS[0]!.name, description: AGENT_TOOLS[0]!.description, input_schema: AGENT_TOOLS[0]!.parameters })
    expect(options).toEqual({ signal: input.signal })
  })

  it('parses text and tool_use blocks, ignoring thinking', async () => {
    const create = vi.fn().mockResolvedValue(
      message(
        [
          { type: 'thinking', thinking: '' },
          { type: 'text', text: 'Vou transferir.' },
          { type: 'tool_use', id: 't1', name: 'transferir_para_humano', input: { motivo: 'pediu humano' } },
        ],
        'tool_use',
      ),
    )
    await expect(createAnthropicClient(() => fakeClient(create) as never).generate(input)).resolves.toEqual({
      text: 'Vou transferir.',
      toolCalls: [{ name: 'transferir_para_humano', args: { motivo: 'pediu humano' } }],
    })
  })

  it('treats a refusal as an error', async () => {
    const create = vi.fn().mockResolvedValue(message([], 'refusal'))
    await expect(createAnthropicClient(() => fakeClient(create) as never).generate(input)).rejects.toMatchObject({
      code: 'AI_PROVIDER_ERROR',
      message: expect.stringContaining('o modelo recusou responder'),
    })
  })

  it.each([
    [new Anthropic.AuthenticationError(401, {}, 'invalid x-api-key sk-ant-secret', new Headers()), 'chave inválida ou sem permissão'],
    [new Anthropic.RateLimitError(429, {}, 'rate', new Headers()), 'limite de uso atingido'],
    [new Anthropic.InternalServerError(500, {}, 'boom', new Headers()), 'HTTP 500'],
    [new Anthropic.APIUserAbortError(), 'tempo esgotado'],
    [new Anthropic.APIConnectionError({ message: 'down' }), 'sem resposta'],
  ])('maps SDK errors without leaking the key (%#)', async (error, detail) => {
    const create = vi.fn().mockRejectedValue(error)
    const result = await createAnthropicClient(() => fakeClient(create) as never)
      .generate(input)
      .catch((e: Error) => e)
    expect(result).toMatchObject({ code: 'AI_PROVIDER_ERROR', message: `O provedor de IA não respondeu corretamente (${detail}).` })
    expect((result as Error).message).not.toContain('sk-ant-secret')
  })
})
