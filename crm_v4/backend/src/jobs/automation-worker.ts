import type { Logger } from '../context.js'

export const WORKER_TICK_MS = 5_000
export const CLEANUP_EVERY_MS = 60 * 60 * 1_000

export interface AutomationWorkerJobs {
  /** Advances runs whose wait is due or whose lease expired (engine.tick). */
  tick(now: Date): Promise<unknown>
  /** Deletes finished runs past retention and orphan versions (FR-013). */
  cleanup(now: Date): Promise<unknown>
}

/**
 * Thin timer around the engine: the only automation code outside MVC, like realtime/ for SSE.
 * Ticks never overlap; a failing tick is logged and the next one still runs.
 */
export function startAutomationWorker(jobs: AutomationWorkerJobs, log: Logger, now: () => Date = () => new Date()) {
  let isRunning = false
  let lastCleanupAt = 0

  async function runOnce() {
    if (isRunning) return
    isRunning = true
    try {
      const at = now()
      await jobs.tick(at)
      if (at.getTime() - lastCleanupAt >= CLEANUP_EVERY_MS) {
        lastCleanupAt = at.getTime()
        await jobs.cleanup(at)
      }
    } catch (error) {
      log.error({ err: error }, 'automation worker tick failed')
    } finally {
      isRunning = false
    }
  }

  const timer = setInterval(() => void runOnce(), WORKER_TICK_MS)
  return {
    stop: () => clearInterval(timer),
    /** Exposed for tests and for a first tick right after startup. */
    runOnce,
  }
}
