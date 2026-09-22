// @vitest-environment node
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Reads the real tokens so a palette change can't silently break WCAG AA.
const css = readFileSync(join(import.meta.dirname, '../app/globals.css'), 'utf8')
const token = (name: string) => {
  const match = new RegExp(`--color-${name}:\\s*(#[0-9a-f]{6})`, 'i').exec(css)
  if (!match?.[1]) throw new Error(`token --color-${name} not found`)
  return match[1]
}

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
}

function contrast(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi! + 0.05) / (lo! + 0.05)
}

const AA_TEXT = 4.5

describe('brand contrast (WCAG AA, normal text)', () => {
  it.each([
    ['white on brand (primary buttons, outbound bubbles)', token('paper'), token('brand')],
    ['white on brand-dark (hover)', token('paper'), token('brand-dark')],
    ['ink on white (body text)', token('ink'), token('paper')],
    ['muted on white (secondary text)', token('muted'), token('paper')],
    ['muted on mist (secondary text on gray panels)', token('muted'), token('mist')],
    ['brand on white (links, errors)', token('brand'), token('paper')],
    ['white on ink (sidebar)', token('paper'), token('ink')],
  ])('%s passes 4.5:1', (_label, foreground, background) => {
    expect(contrast(foreground, background)).toBeGreaterThanOrEqual(AA_TEXT)
  })

  it.each(['gray', 'red', 'orange', 'amber', 'green', 'teal', 'blue', 'violet'])(
    'stage color %s: text passes 4.5:1 on its background and on white',
    (color) => {
      expect(contrast(token(`stage-${color}`), token(`stage-${color}-bg`))).toBeGreaterThanOrEqual(AA_TEXT)
      expect(contrast(token(`stage-${color}`), token('paper'))).toBeGreaterThanOrEqual(AA_TEXT)
    },
  )

  it('uses the V4 red from the logo', () => {
    expect(token('brand').toLowerCase()).toBe('#e30613')
  })
})
