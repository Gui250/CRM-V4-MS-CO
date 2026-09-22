import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CLEANUP_EVERY_MS, startAutomationWorker, WORKER_TICK_MS } from './automation-worker.js'

const log = () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })

describe('automation worker', () => {
  beforeEach(() => vi.useFakeTimers({ now: new Date('2026-09-22T12:00:00Z') }))
  afterEach(() => vi.useRealTimers())

  it('ticks every WORKER_TICK_MS until stopped', async () => {
    const jobs = { tick: vi.fn().mockResolvedValue(undefined), cleanup: vi.fn().mockResolvedValue(undefined) }
    const worker = startAutomationWorker(jobs, log())
    await vi.advanceTimersByTimeAsync(WORKER_TICK_MS * 3)
    expect(jobs.tick).toHaveBeenCalledTimes(3)
    worker.stop()
    await vi.advanceTimersByTimeAsync(WORKER_TICK_MS * 3)
    expect(jobs.tick).toHaveBeenCalledTimes(3)
  })

  it('does not overlap a slow tick', async () => {
    let finish = () => {}
    const jobs = {
      tick: vi.fn(() => new Promise<void>((resolve) => (finish = resolve))),
      cleanup: vi.fn().mockResolvedValue(undefined),
    }
    const worker = startAutomationWorker(jobs, log())
    await vi.advanceTimersByTimeAsync(WORKER_TICK_MS * 4)
    expect(jobs.tick).toHaveBeenCalledTimes(1)
    finish()
    await vi.advanceTimersByTimeAsync(WORKER_TICK_MS)
    expect(jobs.tick).toHaveBeenCalledTimes(2)
    worker.stop()
  })

  it('logs a failing tick and keeps going', async () => {
    const logger = log()
    const jobs = { tick: vi.fn().mockRejectedValueOnce(new Error('db down')).mockResolvedValue(undefined), cleanup: vi.fn() }
    const worker = startAutomationWorker(jobs, logger)
    await vi.advanceTimersByTimeAsync(WORKER_TICK_MS * 2)
    expect(logger.error).toHaveBeenCalledWith({ err: expect.any(Error) }, 'automation worker tick failed')
    expect(jobs.tick).toHaveBeenCalledTimes(2)
    worker.stop()
  })

  it('runs cleanup on the first tick and then once per hour', async () => {
    const jobs = { tick: vi.fn().mockResolvedValue(undefined), cleanup: vi.fn().mockResolvedValue(undefined) }
    const worker = startAutomationWorker(jobs, log())
    await vi.advanceTimersByTimeAsync(WORKER_TICK_MS)
    expect(jobs.cleanup).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(CLEANUP_EVERY_MS - WORKER_TICK_MS)
    expect(jobs.cleanup).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(WORKER_TICK_MS)
    expect(jobs.cleanup).toHaveBeenCalledTimes(2)
    worker.stop()
  })
})
