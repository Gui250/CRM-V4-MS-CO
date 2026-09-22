import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Readable } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { testConfig } from '../../test/context.js'
import { createStorage } from './index.js'
import { createLocalStorage } from './local.js'
import { createSupabaseStorage } from './supabase.js'

async function readAll(stream: Readable): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks).toString()
}

describe('local storage', () => {
  let dir: string
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'media-'))
  })
  afterEach(() => rm(dir, { recursive: true, force: true }))

  it('writes and streams back a file', async () => {
    const storage = createLocalStorage(dir)
    await storage.put('media/2026/09/abc', Buffer.from('conteúdo'), 'text/plain')
    expect(await readAll((await storage.get('media/2026/09/abc'))!)).toBe('conteúdo')
  })

  it('returns null for a missing file and rejects keys escaping the root', async () => {
    const storage = createLocalStorage(dir)
    expect(await storage.get('nao/existe')).toBeNull()
    await expect(storage.put('../fora', Buffer.from('x'), 'text/plain')).rejects.toThrow()
  })
})

describe('supabase storage', () => {
  const fetchMock = vi.fn<typeof fetch>()
  const storage = createSupabaseStorage({ url: 'https://p.supabase.co', serviceRoleKey: 'srk', bucket: 'media', fetch: fetchMock })
  beforeEach(() => fetchMock.mockReset())

  it('uploads with the service role key', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 200 }))
    await storage.put('media/a', Buffer.from('x'), 'image/png')
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://p.supabase.co/storage/v1/object/media/media/a')
    expect(init).toMatchObject({ method: 'POST', headers: { Authorization: 'Bearer srk', 'Content-Type': 'image/png' } })
  })

  it('downloads via the authenticated endpoint, null when missing, throws on failure', async () => {
    fetchMock.mockResolvedValueOnce(new Response('dados', { status: 200 }))
    expect(await readAll((await storage.get('media/a'))!)).toBe('dados')
    expect(String(fetchMock.mock.calls[0]![0])).toBe('https://p.supabase.co/storage/v1/object/authenticated/media/media/a')

    fetchMock.mockResolvedValueOnce(new Response('', { status: 404 }))
    expect(await storage.get('media/b')).toBeNull()

    fetchMock.mockResolvedValueOnce(new Response('', { status: 500 }))
    await expect(storage.get('media/c')).rejects.toThrow()
    fetchMock.mockResolvedValueOnce(new Response('', { status: 500 }))
    await expect(storage.put('media/c', Buffer.from('x'), 'image/png')).rejects.toThrow()
  })
})

describe('createStorage', () => {
  it('picks the driver from STORAGE_DRIVER', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}'))
    const supabase = createStorage(
      { ...testConfig, STORAGE_DRIVER: 'supabase', SUPABASE_URL: 'https://p.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'k' },
      fetchMock,
    )
    await supabase.put('k', Buffer.from('x'), 'text/plain')
    expect(fetchMock).toHaveBeenCalled()

    const local = createStorage({ ...testConfig, MEDIA_DIR: join(tmpdir(), 'media-pick') })
    expect(await local.get('nada')).toBeNull()
  })
})
