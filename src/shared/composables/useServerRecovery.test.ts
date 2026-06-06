import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { gitlabGraphql } = vi.hoisted(() => ({ gitlabGraphql: vi.fn() }))
vi.mock('@/shared/lib/rpc', () => ({ rpc: { gitlabGraphql } }))

import { backoffMs, probeServer, useServerRecovery } from './useServerRecovery'
import { sessionState } from './useSession'

beforeEach(() => {
  gitlabGraphql.mockReset()
  sessionState.expired = false
  sessionState.unavailable = false
})

describe('backoffMs', () => {
  it('steps 2s → 5s → 15s and caps at 15s', () => {
    expect(backoffMs(0)).toBe(2000)
    expect(backoffMs(1)).toBe(5000)
    expect(backoffMs(2)).toBe(15000)
    expect(backoffMs(7)).toBe(15000)
  })
})

describe('probeServer', () => {
  it('returns "ok" on a clean 200', async () => {
    gitlabGraphql.mockResolvedValue({ status: 200, errors: [] })
    expect(await probeServer()).toBe('ok')
  })

  it('returns "auth" on 401/403', async () => {
    gitlabGraphql.mockResolvedValue({ status: 401 })
    expect(await probeServer()).toBe('auth')
    gitlabGraphql.mockResolvedValue({ status: 403 })
    expect(await probeServer()).toBe('auth')
  })

  it('returns "down" on 5xx', async () => {
    gitlabGraphql.mockResolvedValue({ status: 503 })
    expect(await probeServer()).toBe('down')
  })

  it('returns "down" when the rpc rejects', async () => {
    gitlabGraphql.mockRejectedValue(new Error('boom'))
    expect(await probeServer()).toBe('down')
  })

  it('treats a 200 with body errors as "ok" (server is reachable)', async () => {
    gitlabGraphql.mockResolvedValue({ status: 200, errors: [{ message: 'x' }] })
    expect(await probeServer()).toBe('ok')
  })
})

describe('useServerRecovery', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('clears the banner and refetches on a successful probe', async () => {
    sessionState.unavailable = true
    gitlabGraphql.mockResolvedValue({ status: 200, errors: [] })
    const invalidateQueries = vi.fn().mockResolvedValue(undefined)
    const recovery = useServerRecovery({ invalidateQueries } as never)

    recovery.start()
    await vi.advanceTimersByTimeAsync(2000)

    expect(gitlabGraphql).toHaveBeenCalledTimes(1)
    expect(sessionState.unavailable).toBe(false)
    expect(invalidateQueries).toHaveBeenCalledTimes(1)
  })

  it('escalates to expired when the probe returns auth', async () => {
    sessionState.unavailable = true
    gitlabGraphql.mockResolvedValue({ status: 401 })
    const recovery = useServerRecovery({ invalidateQueries: vi.fn() } as never)

    recovery.start()
    await vi.advanceTimersByTimeAsync(2000)

    expect(sessionState.expired).toBe(true)
    expect(sessionState.unavailable).toBe(false)
  })

  it('reschedules on a "down" probe using the next backoff step', async () => {
    sessionState.unavailable = true
    gitlabGraphql.mockResolvedValue({ status: 503 })
    const recovery = useServerRecovery({ invalidateQueries: vi.fn() } as never)

    recovery.start()
    await vi.advanceTimersByTimeAsync(2000)
    expect(gitlabGraphql).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(5000)
    expect(gitlabGraphql).toHaveBeenCalledTimes(2)

    recovery.stop()
  })

  it('stop() cancels a pending probe', async () => {
    sessionState.unavailable = true
    gitlabGraphql.mockResolvedValue({ status: 503 })
    const recovery = useServerRecovery({ invalidateQueries: vi.fn() } as never)

    recovery.start()
    recovery.stop()
    await vi.advanceTimersByTimeAsync(15000)
    expect(gitlabGraphql).not.toHaveBeenCalled()
  })

  it('does not mutate state if stopped while a probe is in flight', async () => {
    sessionState.unavailable = true
    let resolve!: (v: { status: number }) => void
    gitlabGraphql.mockReturnValue(
      new Promise<{ status: number }>((r) => {
        resolve = r
      }),
    )
    const invalidateQueries = vi.fn().mockResolvedValue(undefined)
    const recovery = useServerRecovery({ invalidateQueries } as never)

    recovery.start()
    await vi.advanceTimersByTimeAsync(2000) // timer fires, probe is now awaiting
    recovery.stop() // stop while the probe promise is unresolved
    resolve({ status: 200 }) // probe resolves AFTER stop
    await Promise.resolve()
    await Promise.resolve()

    expect(invalidateQueries).not.toHaveBeenCalled()
    expect(sessionState.unavailable).toBe(true)
  })
})
