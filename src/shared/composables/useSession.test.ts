import { describe, it, expect, vi, beforeEach } from 'vitest'

const getServerHealth = vi.fn()
vi.mock('@/shared/lib/rpc', () => ({ rpc: { getServerHealth: () => getServerHealth() } }))

import { sessionState, installServerHealth } from './useSession'
import { QueryClient } from '@tanstack/vue-query'

beforeEach(() => {
  getServerHealth.mockReset()
  getServerHealth.mockResolvedValue({ state: 'ok', secondsLeft: 0, probing: false })
  sessionState.expired = false
  sessionState.unavailable = false
  sessionState.secondsLeft = 0
  sessionState.probing = false
})

const emit = (detail: { state: string; secondsLeft: number; probing: boolean }) =>
  window.dispatchEvent(new CustomEvent('lumen:server-health', { detail }))

describe('installServerHealth', () => {
  it('seeds sessionState from getServerHealth on install', async () => {
    getServerHealth.mockResolvedValue({ state: 'down', secondsLeft: 5, probing: false })
    const qc = new QueryClient()
    const stop = installServerHealth(qc)
    await Promise.resolve()
    await Promise.resolve()
    expect(sessionState.unavailable).toBe(true)
    expect(sessionState.secondsLeft).toBe(5)
    stop()
  })

  it('mirrors a down event into the unavailable banner state', () => {
    const qc = new QueryClient()
    const stop = installServerHealth(qc)
    emit({ state: 'down', secondsLeft: 3, probing: false })
    expect(sessionState.unavailable).toBe(true)
    expect(sessionState.expired).toBe(false)
    expect(sessionState.secondsLeft).toBe(3)
    stop()
  })

  it('mirrors an expired event into the overlay state', () => {
    const qc = new QueryClient()
    const stop = installServerHealth(qc)
    emit({ state: 'expired', secondsLeft: 0, probing: false })
    expect(sessionState.expired).toBe(true)
    expect(sessionState.unavailable).toBe(false)
    stop()
  })

  it("invalidates this window's queries when recovering from down", () => {
    const qc = new QueryClient()
    const invalidate = vi.spyOn(qc, 'invalidateQueries').mockResolvedValue()
    const stop = installServerHealth(qc)
    emit({ state: 'down', secondsLeft: 2, probing: false })
    emit({ state: 'ok', secondsLeft: 0, probing: false })
    expect(sessionState.unavailable).toBe(false)
    expect(invalidate).toHaveBeenCalledTimes(1)
    stop()
  })

  it('does not invalidate on an ok→ok event (no spurious refetch)', () => {
    const qc = new QueryClient()
    const invalidate = vi.spyOn(qc, 'invalidateQueries').mockResolvedValue()
    const stop = installServerHealth(qc)
    emit({ state: 'ok', secondsLeft: 0, probing: false })
    expect(invalidate).not.toHaveBeenCalled()
    stop()
  })

  it('stops reacting after cleanup', () => {
    const qc = new QueryClient()
    const stop = installServerHealth(qc)
    stop()
    emit({ state: 'down', secondsLeft: 9, probing: false })
    expect(sessionState.unavailable).toBe(false)
  })
})
