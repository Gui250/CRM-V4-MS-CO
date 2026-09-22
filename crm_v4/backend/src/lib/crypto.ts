import { decryptSecret, encryptSecret } from './secret-box.js'

// Source credentials (BI_SECRETS_KEY). Same AES-256-GCM box as the AI keys, serialized as one
// `iv.tag.ciphertext` string so it fits a single text column.
const KEY_BYTES = 32
const AUTH_TAG_BYTES = 16
const MASK = '••••'
const MASK_VISIBLE_CHARS = 4
const MASK_MIN_LENGTH = 8

function parseKey(keyBase64: string): Buffer {
  const key = Buffer.from(keyBase64, 'base64')
  if (key.length !== KEY_BYTES) throw new Error('A chave de segredos precisa ter 32 bytes em base64.')
  return key
}

export function encryptSecrets(value: Record<string, unknown>, keyBase64: string): string {
  const sealed = encryptSecret(JSON.stringify(value), parseKey(keyBase64))
  return [sealed.iv, sealed.authTag, sealed.ciphertext].map((part) => part.toString('base64')).join('.')
}

/** Throws if the payload is malformed, the key is wrong or anything was tampered with. */
export function decryptSecrets(payload: string, keyBase64: string): Record<string, unknown> {
  const [iv, authTag, ciphertext, ...extra] = payload.split('.').map((part) => Buffer.from(part, 'base64'))
  // A short tag would weaken GCM's integrity check, so only the full 16 bytes are accepted.
  if (!iv || !authTag || !ciphertext || extra.length > 0 || authTag.length !== AUTH_TAG_BYTES) {
    throw new Error('Segredo cifrado em formato inválido.')
  }
  return JSON.parse(decryptSecret({ iv, authTag, ciphertext }, parseKey(keyBase64))) as Record<string, unknown>
}

/** What the API shows instead of a stored secret. */
export const maskSecret = (value: string) =>
  value.length > MASK_MIN_LENGTH ? `${MASK}${value.slice(-MASK_VISIBLE_CHARS)}` : MASK
