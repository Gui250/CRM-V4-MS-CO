import { vi } from 'vitest'
import type { Config } from '../config.js'
import type { AppContext } from '../context.js'
import type { Db } from '../db/client.js'
import type { EvolutionClient } from '../integrations/evolution/client.js'
import type { Storage } from '../integrations/storage/index.js'

export const testConfig: Config = {
  PORT: 3333,
  DATABASE_URL: 'postgres://test',
  SESSION_COOKIE_SECURE: false,
  STORAGE_DRIVER: 'local',
  MEDIA_DIR: '.media-test',
  SUPABASE_URL: undefined,
  SUPABASE_SERVICE_ROLE_KEY: undefined,
  SUPABASE_BUCKET: 'media',
  EVOLUTION_URL: 'http://evolution.test',
  EVOLUTION_API_KEY: 'api-key',
  EVOLUTION_INSTANCE: 'v4-msco',
  EVOLUTION_WEBHOOK_TOKEN: 'webhook-token-1234567890',
  PUBLIC_BACKEND_URL: 'http://backend.test',
  AI_CREDENTIALS_KEY: Buffer.alloc(32, 7).toString('base64'),
  BI_SECRETS_KEY: Buffer.alloc(32, 9).toString('base64'),
  BI_ALLOW_PRIVATE_NETWORKS: false,
}

export function fakeEvolution(): { [K in keyof EvolutionClient]: ReturnType<typeof vi.fn> } {
  return {
    createInstance: vi.fn(),
    instanceExists: vi.fn(),
    connect: vi.fn(),
    connectionState: vi.fn(),
    logout: vi.fn(),
    setWebhook: vi.fn(),
    sendText: vi.fn(),
    sendMedia: vi.fn(),
    markAsRead: vi.fn(),
    getMediaBase64: vi.fn(),
    fetchProfilePictureUrl: vi.fn(),
    checkWhatsAppNumber: vi.fn(),
  }
}

/** Context with fakes; models are mocked per test with vi.mock, so db is never touched. */
export function fakeContext(overrides: Partial<AppContext> = {}) {
  const evolution = fakeEvolution()
  const storage = { put: vi.fn(), get: vi.fn() }
  const bus = { publish: vi.fn(), subscribe: vi.fn() }
  const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
  const aiClient = () => ({ generate: vi.fn(), listModels: vi.fn() })
  const ai = { openai: aiClient(), anthropic: aiClient(), gemini: aiClient() }
  const biConnectors = { read: vi.fn(), listSheets: vi.fn() }
  const ctx: AppContext = {
    config: testConfig,
    db: {} as Db,
    bus,
    evolution: evolution as unknown as EvolutionClient,
    storage: storage as unknown as Storage,
    ai,
    biConnectors,
    log,
    ...overrides,
  }
  return { ctx, evolution, storage, bus, log, ai, biConnectors }
}
