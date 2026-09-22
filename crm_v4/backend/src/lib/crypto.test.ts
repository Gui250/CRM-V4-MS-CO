import { randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { decryptSecrets, encryptSecrets, maskSecret } from './crypto.js'

const key = randomBytes(32).toString('base64')

describe('encryptSecrets / decryptSecrets', () => {
  it('round-trips an object', () => {
    const payload = encryptSecrets({ password: 's3nha', headers: [{ name: 'X', value: 'y' }] }, key)

    expect(decryptSecrets(payload, key)).toEqual({ password: 's3nha', headers: [{ name: 'X', value: 'y' }] })
  })

  it('writes iv.tag.ciphertext, each part base64', () => {
    const parts = encryptSecrets({ password: 'x' }, key).split('.')

    expect(parts).toHaveLength(3)
    expect(Buffer.from(parts[0]!, 'base64')).toHaveLength(12)
    expect(Buffer.from(parts[1]!, 'base64')).toHaveLength(16)
  })

  it('uses a fresh IV on every call', () => {
    const a = encryptSecrets({ password: 'x' }, key)
    const b = encryptSecrets({ password: 'x' }, key)

    expect(a.split('.')[0]).not.toBe(b.split('.')[0])
  })

  it('never exposes the plain text', () => {
    expect(encryptSecrets({ password: 'supersecret' }, key)).not.toContain('supersecret')
  })

  it('throws when the ciphertext was tampered with', () => {
    const [iv, tag, ciphertext] = encryptSecrets({ password: 'x' }, key).split('.')
    const bytes = Buffer.from(ciphertext!, 'base64')
    bytes[0] = bytes[0]! ^ 0xff

    expect(() => decryptSecrets(`${iv}.${tag}.${bytes.toString('base64')}`, key)).toThrow()
  })

  it('throws with a truncated auth tag', () => {
    const [iv, tag, ciphertext] = encryptSecrets({ password: 'x' }, key).split('.')
    const shortTag = Buffer.from(tag!, 'base64').subarray(0, 4).toString('base64')

    expect(() => decryptSecrets(`${iv}.${shortTag}.${ciphertext}`, key)).toThrow()
  })

  it('throws with the wrong key', () => {
    const payload = encryptSecrets({ password: 'x' }, key)

    expect(() => decryptSecrets(payload, randomBytes(32).toString('base64'))).toThrow()
  })

  it('rejects a key that is not 32 bytes', () => {
    expect(() => encryptSecrets({}, randomBytes(16).toString('base64'))).toThrow(/32 bytes/)
  })
})

describe('maskSecret', () => {
  it('keeps only the last 4 characters of long values', () => {
    expect(maskSecret('supersecret1234')).toBe('••••1234')
  })

  it('fully masks values of 8 characters or fewer', () => {
    expect(maskSecret('12345678')).toBe('••••')
  })
})
