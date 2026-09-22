import { describe, expect, it } from 'vitest'
import { CHART_BACKGROUND, SERIES_COLORS } from './chart-theme'

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
}

const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi! + 0.05) / (lo! + 0.05)
}

describe('chart series palette', () => {
  it('starts with the brand red', () => expect(SERIES_COLORS[0]).toBe('#e30613'))
  it('has 8 distinct colors', () => expect(new Set(SERIES_COLORS).size).toBe(8))
  it.each(SERIES_COLORS)('%s has ≥ 3:1 contrast against the panel (WCAG graphics)', (color) =>
    expect(contrast(color, CHART_BACKGROUND)).toBeGreaterThanOrEqual(3))
})
