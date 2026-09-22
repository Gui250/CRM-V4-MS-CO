import { describe, expect, it } from 'vitest'
import type { NodeType } from '@/lib/automation-types'
import { defaultConfig, durationMs, NODE_LABELS, THIRTY_DAYS_MS } from './node-defaults'

describe('defaultConfig', () => {
  it('has a config and a label for every node type', () => {
    for (const type of Object.keys(NODE_LABELS) as NodeType[]) expect(defaultConfig(type)).toBeDefined()
  })

  it('returns a fresh copy each time', () => {
    const a = defaultConfig('wait')
    a.amount = 99
    expect(defaultConfig('wait').amount).toBe(5)
  })

  it('starts the agent inactivity timeout at 24 hours', () => {
    expect(defaultConfig('ai_agent').inactivityTimeout).toEqual({ amount: 24, unit: 'hours' })
  })

  it('keeps default waits within the 30-day limit', () => {
    expect(durationMs(defaultConfig('wait'))).toBeLessThanOrEqual(THIRTY_DAYS_MS)
    expect(durationMs(defaultConfig('wait_reply').timeout)).toBeLessThanOrEqual(THIRTY_DAYS_MS)
  })
})
