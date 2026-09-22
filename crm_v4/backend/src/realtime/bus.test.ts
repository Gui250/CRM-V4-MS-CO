import { describe, expect, it, vi } from 'vitest'
import { createEventBus, type RealtimeEvent } from './bus.js'

const event: RealtimeEvent = {
  type: 'connection.updated',
  data: { connection: { status: 'connected', phoneNumber: '5511', qrCode: null, lastConnectedAt: null } },
}

describe('event bus', () => {
  it('delivers published events to every subscriber', () => {
    const bus = createEventBus()
    const first = vi.fn()
    const second = vi.fn()
    bus.subscribe(first)
    bus.subscribe(second)

    bus.publish(event)

    expect(first).toHaveBeenCalledWith(event)
    expect(second).toHaveBeenCalledWith(event)
  })

  it('stops delivering after unsubscribe', () => {
    const bus = createEventBus()
    const handler = vi.fn()
    const unsubscribe = bus.subscribe(handler)

    unsubscribe()
    bus.publish(event)

    expect(handler).not.toHaveBeenCalled()
  })
})
