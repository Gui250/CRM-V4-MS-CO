import { createAnthropicClient } from './anthropic.js'
import { createGeminiClient } from './gemini.js'
import type { AiRegistry } from './index.js'
import { createOpenAiClient } from './openai.js'

export function createAiRegistry(doFetch: typeof fetch = fetch): AiRegistry {
  return {
    openai: createOpenAiClient(doFetch),
    anthropic: createAnthropicClient(),
    gemini: createGeminiClient(doFetch),
  }
}
