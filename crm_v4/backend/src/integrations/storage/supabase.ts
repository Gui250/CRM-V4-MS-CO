import { Readable } from 'node:stream'
import type { ReadableStream as WebReadableStream } from 'node:stream/web'
import type { Storage } from './index.js'

interface Options {
  url: string
  serviceRoleKey: string
  bucket: string
  fetch: typeof fetch
}

/** Supabase Storage over its REST API, with the service role key (backend only). */
export function createSupabaseStorage(options: Options): Storage {
  const base = `${options.url.replace(/\/$/, '')}/storage/v1/object`
  const auth = { Authorization: `Bearer ${options.serviceRoleKey}` }
  const objectPath = (key: string) => `${encodeURIComponent(options.bucket)}/${key.split('/').map(encodeURIComponent).join('/')}`

  return {
    async put(key, data, mime) {
      const response = await options.fetch(`${base}/${objectPath(key)}`, {
        method: 'POST',
        headers: { ...auth, 'Content-Type': mime, 'x-upsert': 'true' },
        body: new Uint8Array(data),
      })
      if (!response.ok) throw new Error(`Supabase Storage respondeu ${response.status} ao salvar ${key}`)
    },
    async get(key) {
      const response = await options.fetch(`${base}/authenticated/${objectPath(key)}`, { headers: auth })
      if (response.status === 404 || response.status === 400) return null
      if (!response.ok || !response.body) throw new Error(`Supabase Storage respondeu ${response.status} ao ler ${key}`)
      return Readable.fromWeb(response.body as WebReadableStream)
    },
  }
}
