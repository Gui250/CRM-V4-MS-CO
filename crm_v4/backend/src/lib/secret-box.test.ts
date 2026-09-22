import { randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { decryptSecret, encryptSecret, keyHint } from './secret-box.js'

const key = randomBytes(32)

describe('secret-box', () => {
  it('round-trips a secret', () => {
    expect(decryptSecret(encryptSecret('sk-live-abc123', key), key)).toBe('sk-live-abc123')
  })

  it('uses a different IV and ciphertext on every call', () => {
    const a = encryptSecret('same', key)
    const b = encryptSecret('same', key)
    expect(a.iv.equals(b.iv)).toBe(false)
    expect(a.ciphertext.equals(b.ciphertext)).toBe(false)
  })

  it('rejects a tampered auth tag', () => {
    const sealed = encryptSecret('secret', key)
    sealed.authTag[0] = (sealed.authTag[0] ?? 0) ^ 0xff
    expect(() => decryptSecret(sealed, key)).toThrow()
  })

  it('rejects the wrong key', () => {
    const sealed = encryptSecret('secret', key)
    expect(() => decryptSecret(sealed, randomBytes(32))).toThrow()
  })

  it('never stores the plain text in the ciphertext', () => {
    expect(encryptSecret('sk-live-abc123', key).ciphertext.toString('utf8')).not.toContain('sk-live')
  })

  it('shows only the last 4 characters as hint', () => {
    expect(keyHint('sk-live-abc123')).toBe('…c123')
  })
})
