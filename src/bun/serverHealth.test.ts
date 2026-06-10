import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  classifyStatus,
  startServerHealth,
  observe,
  retryNow,
  getHealth,
  isProbing,
  resetForReconnect,
  __resetForTest,
} from './serverHealth'

const broadcast = vi.fn()
let probeOutcome: 'ok' | 'auth' | 'down' = 'down'

beforeEach(() => {
  vi.useFakeTimers()
  broadcast.mockReset()
  probeOutcome = 'down'
  startServerHealth({ probe: async () => probeOutcome, broadcast })
  __resetForTest()
})
afterEach(() => vi.useRealTimers())

describe('classifyStatus', () => {
  it('maps statuses to outcomes (mirrors the old probeServer)', () => {
    expect(classifyStatus(401, false)).toBe('auth')
    expect(classifyStatus(403, true)).toBe('auth')
    expect(classifyStatus(403, false)).toBe('down')
    expect(classifyStatus(503, false)).toBe('down')
    expect(classifyStatus(500, false)).toBe('down')
    expect(classifyStatus(200, false)).toBe('ok')
    expect(classifyStatus(404, false)).toBe('ok')
  })
})

describe('serverHealth state machine', () => {
  it('starts ok and idle', () => {
    expect(getHealth()).toEqual({ state: 'ok', secondsLeft: 0, probing: false })
  })

  it('a down observation starts recovery with a 2s countdown', () => {
    observe('down')
    expect(getHealth()).toMatchObject({ state: 'down', secondsLeft: 2, probing: false })
    expect(broadcast).toHaveBeenLastCalledWith({ state: 'down', secondsLeft: 2, probing: false })
  })

  it('counts the seconds down each tick', async () => {
    observe('down')
    await vi.advanceTimersByTimeAsync(1000)
    expect(getHealth().secondsLeft).toBe(1)
  })

  it('recovers to ok when a probe succeeds', async () => {
    observe('down')
    probeOutcome = 'ok'
    await vi.advanceTimersByTimeAsync(2000)
    expect(getHealth().state).toBe('ok')
    expect(broadcast).toHaveBeenLastCalledWith({ state: 'ok', secondsLeft: 0, probing: false })
  })

  it('escalates to expired when a recovery probe returns auth', async () => {
    observe('down')
    probeOutcome = 'auth'
    await vi.advanceTimersByTimeAsync(2000)
    expect(getHealth().state).toBe('expired')
  })

  it('reschedules on the next backoff step when a probe still fails', async () => {
    observe('down')
    probeOutcome = 'down'
    await vi.advanceTimersByTimeAsync(2000)
    expect(getHealth().secondsLeft).toBe(5)
    await vi.advanceTimersByTimeAsync(5000)
    expect(getHealth().secondsLeft).toBe(15)
  })

  it('confirms before latching expired: a transient auth does NOT expire if the probe is clean', async () => {
    probeOutcome = 'ok'
    observe('auth')
    await vi.advanceTimersByTimeAsync(0)
    expect(getHealth().state).toBe('ok')
  })

  it('latches expired when an auth observation is confirmed by the probe', async () => {
    probeOutcome = 'auth'
    observe('auth')
    await vi.advanceTimersByTimeAsync(0)
    expect(getHealth().state).toBe('expired')
  })

  it('ignores observations once down (the recovery loop drives)', async () => {
    observe('down')
    broadcast.mockClear()
    observe('down')
    observe('auth')
    expect(broadcast).not.toHaveBeenCalled()
  })

  it('retryNow() probes immediately instead of waiting for the backoff', async () => {
    observe('down')
    const probe = vi.fn(async () => 'down' as const)
    startServerHealth({ probe, broadcast })
    retryNow()
    expect(probe).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(0)
  })

  it('resetForReconnect clears down/expired back to ok', async () => {
    observe('down')
    resetForReconnect()
    expect(getHealth().state).toBe('ok')
  })

  it('isProbing() is true while a recovery probe runs, false after', async () => {
    let resolve!: (o: 'down') => void
    startServerHealth({ probe: () => new Promise<'down'>((r) => (resolve = r)), broadcast })
    observe('down')
    await vi.advanceTimersByTimeAsync(2000) // timer fires → recovery probe is now awaiting
    expect(isProbing()).toBe(true)
    resolve('down')
    await vi.advanceTimersByTimeAsync(0)
    expect(isProbing()).toBe(false)
  })

  it('isProbing() is true during a confirm-auth probe too (guards the hook)', async () => {
    let resolve!: (o: 'ok') => void
    startServerHealth({ probe: () => new Promise<'ok'>((r) => (resolve = r)), broadcast })
    observe('auth') // ok → confirmAuth → probe now awaiting
    expect(isProbing()).toBe(true)
    resolve('ok')
    await vi.advanceTimersByTimeAsync(0)
    expect(isProbing()).toBe(false)
  })

  it('observe("ok") while down recovers immediately', () => {
    observe('down')
    observe('ok')
    expect(getHealth().state).toBe('ok')
  })
})
