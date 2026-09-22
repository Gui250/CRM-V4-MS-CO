import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_BYTES = 12
const HINT_CHARS = 4

export interface SealedSecret {
  ciphertext: Buffer
  iv: Buffer
  authTag: Buffer
}

/** AES-256-GCM. `key` is the 32-byte AI_CREDENTIALS_KEY; a fresh IV per call. */
export function encryptSecret(plain: string, key: Buffer): SealedSecret {
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return { ciphertext, iv, authTag: cipher.getAuthTag() }
}

/** Throws if the key is wrong or the data was tampered with (GCM auth tag check). */
export function decryptSecret(sealed: SealedSecret, key: Buffer): string {
  const decipher = createDecipheriv(ALGORITHM, key, sealed.iv)
  decipher.setAuthTag(sealed.authTag)
  return Buffer.concat([decipher.update(sealed.ciphertext), decipher.final()]).toString('utf8')
}

/** The only part of a secret ever shown back to users. */
export const keyHint = (plain: string) => `…${plain.slice(-HINT_CHARS)}`
