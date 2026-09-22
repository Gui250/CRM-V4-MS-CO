import { buildApp } from './app.js'
import { loadConfig } from './config.js'
import { runDueRefreshes } from './controllers/bi-ingest.js'
import { createDb } from './db/client.js'
import { createAiRegistry } from './integrations/ai/registry.js'
import { createBiConnectors } from './integrations/bi-connectors/index.js'
import { createEvolutionClient } from './integrations/evolution/client.js'
import { createStorage } from './integrations/storage/index.js'
import { createEventBus } from './realtime/bus.js'

const config = loadConfig()
const { db, close } = createDb(config.DATABASE_URL)
const webhookUrl = `${config.PUBLIC_BACKEND_URL}/api/webhooks/evolution?token=${encodeURIComponent(config.EVOLUTION_WEBHOOK_TOKEN)}`

const storage = createStorage(config)

const ctx = {
  config,
  db,
  bus: createEventBus(),
  storage,
  ai: createAiRegistry(),
  biConnectors: createBiConnectors({
    storage,
    allowPrivateNetworks: config.BI_ALLOW_PRIVATE_NETWORKS,
  }),
  evolution: createEvolutionClient({
    baseUrl: config.EVOLUTION_URL,
    apiKey: config.EVOLUTION_API_KEY,
    instance: config.EVOLUTION_INSTANCE,
    webhookUrl,
  }),
}

const app = await buildApp(ctx, {
  logger: {
    serializers: {
      // The webhook token travels in the query string; never write it to logs.
      req: (req: { method: string; url: string }) => ({
        method: req.method,
        url: req.url.replace(/token=[^&]*/, 'token=***'),
      }),
    },
  },
  // Webhook payloads with media metadata and base64 uploads can be large.
  bodyLimit: 20 * 1024 * 1024,
})

// Scheduled BI source refreshes; skips a tick while the previous one is still running.
let refreshing = false
const refreshTimer = setInterval(() => {
  if (refreshing) return
  refreshing = true
  void runDueRefreshes({ ...ctx, log: app.log })
    .catch((error: unknown) => app.log.error({ err: error }, 'bi refresh tick failed'))
    .finally(() => (refreshing = false))
}, 60_000)
refreshTimer.unref()

app.addHook('onClose', async () => {
  clearInterval(refreshTimer)
  await close()
})
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => void app.close().then(() => process.exit(0)))
}

await app.listen({ port: config.PORT, host: '0.0.0.0' })
