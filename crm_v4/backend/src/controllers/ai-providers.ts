import type { AppContext } from '../context.js'
import type { AiVendor } from '../integrations/ai/index.js'
import { PROVIDER_TIMEOUT_MS } from '../integrations/ai/index.js'
import { conflict, DomainError, notFound } from '../lib/errors.js'
import { decryptSecret, encryptSecret, keyHint } from '../lib/secret-box.js'
import * as agentModel from '../models/ai-agent.js'
import * as providerModel from '../models/ai-provider.js'
import { toAiProviderDto } from './automation-dto.js'

const credentialsKey = (ctx: AppContext) => Buffer.from(ctx.config.AI_CREDENTIALS_KEY, 'base64')

/** Lists the models with the given key: the connection test of FR-015. Nothing is saved on failure. */
async function testConnection(ctx: AppContext, vendor: AiVendor, apiKey: string): Promise<string[]> {
  try {
    return await ctx.ai[vendor].listModels(apiKey, AbortSignal.timeout(PROVIDER_TIMEOUT_MS))
  } catch (error) {
    const detail = error instanceof DomainError ? error.message : 'erro desconhecido.'
    throw new DomainError('AI_PROVIDER_TEST_FAILED', `Não foi possível conectar ao provedor: ${detail}`, 422)
  }
}

function sealKey(ctx: AppContext, apiKey: string) {
  const sealed = encryptSecret(apiKey, credentialsKey(ctx))
  return { keyCiphertext: sealed.ciphertext, keyIv: sealed.iv, keyAuthTag: sealed.authTag, keyHint: keyHint(apiKey) }
}

async function load(ctx: AppContext, id: string) {
  const provider = await providerModel.findById(ctx.db, id)
  if (!provider) throw notFound('Provedor de IA não encontrado.')
  return provider
}

export async function list(ctx: AppContext) {
  return (await providerModel.list(ctx.db)).map(toAiProviderDto)
}

export async function create(ctx: AppContext, input: { name: string; vendor: AiVendor; apiKey: string }) {
  const availableModels = await testConnection(ctx, input.vendor, input.apiKey)
  const provider = await providerModel.create(ctx.db, { name: input.name, vendor: input.vendor, availableModels, ...sealKey(ctx, input.apiKey) })
  return toAiProviderDto(provider)
}

export async function update(ctx: AppContext, id: string, input: { name?: string; apiKey?: string }) {
  const provider = await load(ctx, id)
  const keyPatch = input.apiKey
    ? { ...sealKey(ctx, input.apiKey), availableModels: await testConnection(ctx, provider.vendor, input.apiKey), tested: true }
    : {}
  return toAiProviderDto((await providerModel.update(ctx.db, id, { name: input.name, ...keyPatch }))!)
}

/** Decrypts the stored key. Only for calling the provider; never returned by the API. */
export async function resolveCredentials(ctx: AppContext, providerId: string): Promise<{ vendor: AiVendor; apiKey: string }> {
  const provider = await load(ctx, providerId)
  const apiKey = decryptSecret({ ciphertext: provider.keyCiphertext, iv: provider.keyIv, authTag: provider.keyAuthTag }, credentialsKey(ctx))
  return { vendor: provider.vendor, apiKey }
}

export async function retest(ctx: AppContext, id: string) {
  const { vendor, apiKey } = await resolveCredentials(ctx, id)
  const availableModels = await testConnection(ctx, vendor, apiKey)
  return toAiProviderDto((await providerModel.update(ctx.db, id, { availableModels, tested: true }))!)
}

export async function remove(ctx: AppContext, id: string) {
  await load(ctx, id)
  const agents = await agentModel.listByProvider(ctx.db, id)
  if (agents.length > 0) {
    throw conflict('PROVIDER_IN_USE', `Este provedor é usado pelos agentes: ${agents.map((a) => a.name).join(', ')}.`)
  }
  await providerModel.remove(ctx.db, id)
}
