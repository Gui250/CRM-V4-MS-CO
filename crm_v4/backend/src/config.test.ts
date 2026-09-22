import { describe, expect, it } from 'vitest'
import { loadConfig } from './config.js'

const baseEnv = {
  DATABASE_URL: 'postgres://postgres:postgres@localhost:5432/crm',
  EVOLUTION_URL: 'http://localhost:8080',
  EVOLUTION_API_KEY: 'key',
  EVOLUTION_INSTANCE: 'v4',
  EVOLUTION_WEBHOOK_TOKEN: 'webhook-token-1234567890',
  PUBLIC_BACKEND_URL: 'http://localhost:3333',
  AI_CREDENTIALS_KEY: Buffer.alloc(32, 1).toString('base64'),
  BI_SECRETS_KEY: Buffer.alloc(32, 2).toString('base64'),
}

describe('loadConfig: AI_CREDENTIALS_KEY', () => {
  it('accepts 32 bytes in base64', () => {
    expect(loadConfig(baseEnv).AI_CREDENTIALS_KEY).toBe(baseEnv.AI_CREDENTIALS_KEY)
  })

  it('rejects a key of the wrong size', () => {
    expect(() => loadConfig({ ...baseEnv, AI_CREDENTIALS_KEY: Buffer.alloc(16).toString('base64') })).toThrow(
      /AI_CREDENTIALS_KEY: precisa ser 32 bytes em base64/,
    )
  })

  it('requires the key', () => {
    const { AI_CREDENTIALS_KEY: _omitted, ...env } = baseEnv
    expect(() => loadConfig(env)).toThrow(/AI_CREDENTIALS_KEY/)
  })
})

describe('loadConfig: BI', () => {
  it('rejects a BI_SECRETS_KEY that is not 32 bytes', () => {
    expect(() => loadConfig({ ...baseEnv, BI_SECRETS_KEY: Buffer.alloc(16).toString('base64') })).toThrow(/BI_SECRETS_KEY/)
  })

  it('keeps private networks blocked unless enabled', () => {
    expect(loadConfig(baseEnv).BI_ALLOW_PRIVATE_NETWORKS).toBe(false)
    expect(loadConfig({ ...baseEnv, BI_ALLOW_PRIVATE_NETWORKS: 'true' }).BI_ALLOW_PRIVATE_NETWORKS).toBe(true)
  })
})
