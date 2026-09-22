import type { Readable } from 'node:stream'
import type { Config } from '../../config.js'
import { createLocalStorage } from './local.js'
import { createSupabaseStorage } from './supabase.js'

export interface Storage {
  put(key: string, data: Buffer, mime: string): Promise<void>
  /** Null when the object does not exist. */
  get(key: string): Promise<Readable | null>
}

export function createStorage(config: Config, fetchImpl: typeof fetch = fetch): Storage {
  if (config.STORAGE_DRIVER === 'supabase') {
    return createSupabaseStorage({
      url: config.SUPABASE_URL!,
      serviceRoleKey: config.SUPABASE_SERVICE_ROLE_KEY!,
      bucket: config.SUPABASE_BUCKET,
      fetch: fetchImpl,
    })
  }
  return createLocalStorage(config.MEDIA_DIR)
}
