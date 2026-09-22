import type { Config } from './config.js'
import type { Db } from './db/client.js'
import type { AiRegistry } from './integrations/ai/index.js'
import type { BiConnectors } from './integrations/bi-connectors/index.js'
import type { EvolutionClient } from './integrations/evolution/client.js'
import type { Storage } from './integrations/storage/index.js'
import type { EventBus } from './realtime/bus.js'

export interface Logger {
  info(obj: object, msg?: string): void
  warn(obj: object, msg?: string): void
  error(obj: object, msg?: string): void
}

/** Dependencies shared by controllers. Built once in server.ts, replaced by fakes in tests. */
export interface AppContext {
  config: Config
  db: Db
  bus: EventBus
  evolution: EvolutionClient
  storage: Storage
  ai: AiRegistry
  biConnectors: BiConnectors
  log: Logger
}
