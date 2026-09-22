import { createReadStream } from 'node:fs'
import { access, mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve, sep } from 'node:path'
import type { Storage } from './index.js'

export function createLocalStorage(rootDir: string): Storage {
  const root = resolve(rootDir)
  const pathFor = (key: string) => {
    const path = resolve(root, key)
    if (!path.startsWith(root + sep)) throw new Error(`Chave de storage inválida: ${key}`)
    return path
  }

  return {
    async put(key, data) {
      const path = pathFor(key)
      await mkdir(dirname(path), { recursive: true })
      await writeFile(path, data)
    },
    async get(key) {
      const path = pathFor(key)
      try {
        await access(path)
      } catch {
        return null
      }
      return createReadStream(path)
    },
  }
}
