import { describe, it, expect, vi, beforeEach } from 'vitest'
import { flushPromises } from '@vue/test-utils'

const { gitlabGraphql } = vi.hoisted(() => ({ gitlabGraphql: vi.fn() }))
vi.mock('@/shared/lib/rpc', () => ({ rpc: { gitlabGraphql } }))

import {
  sessionState,
  isAuthError,
  isUnavailableError,
  markSessionExpired,
  markServerUnavailable,
  clearServerUnavailable,
  installAuthWatch,
} from './useSession'
import { QueryClient, MutationObserver } from '@tanstack/vue-query'

beforeEach(() => {
  gitlabGraphql.mockReset()
  gitlabGraphql.mockResolvedValue({ status: 200, errors: [] })
  sessionState.expired = false
  sessionState.unavailable = false
})

const rejectingQuery = (qc: QueryClient, error: unknown) =>
  qc.fetchQuery({ queryKey: ['probe'], queryFn: () => Promise.reject(error) }).catch(() => {})

describe('isAuthError', () => {
  it('is true for a GitLabError with kind "auth"', () => {
    expect(isAuthError({ kind: 'auth', message: 'nope' })).toBe(true)
  })

  it('is false for other GitLabError kinds', () => {
    expect(isAuthError({ kind: 'network', message: 'x' })).toBe(false)
    expect(isAuthError({ kind: 'graphql', message: 'x' })).toBe(false)
    expect(isAuthError({ kind: 'unknown', message: 'x' })).toBe(false)
  })

  it('is false for null and non-objects', () => {
    expect(isAuthError(null)).toBe(false)
    expect(isAuthError(undefined)).toBe(false)
    expect(isAuthError('auth')).toBe(false)
    expect(isAuthError(401)).toBe(false)
  })
})

describe('markSessionExpired', () => {
  it('flips sessionState.expired and is idempotent', () => {
    expect(sessionState.expired).toBe(false)
    markSessionExpired()
    expect(sessionState.expired).toBe(true)
    markSessionExpired()
    expect(sessionState.expired).toBe(true)
  })
})

describe('installAuthWatch — auth (probe-confirmed)', () => {
  it('latches expired when a query auth error is confirmed by the probe', async () => {
    gitlabGraphql.mockResolvedValue({ status: 401 })
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const stop = installAuthWatch(qc)
    await rejectingQuery(qc, { kind: 'auth', message: 'Unauthorized' })
    await flushPromises()
    expect(sessionState.expired).toBe(true)
    stop()
  })

  it('does NOT latch when the confirm probe says the token is still valid', async () => {
    // The exact bug: a transient 401 or a forbidden (403) sub-resource must not
    // log the user out when the token actually works.
    gitlabGraphql.mockResolvedValue({ status: 200, errors: [] })
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const stop = installAuthWatch(qc)
    await rejectingQuery(qc, { kind: 'auth', message: 'Unauthorized' })
    await flushPromises()
    expect(sessionState.expired).toBe(false)
    stop()
  })

  it('raises the banner (not the overlay) when the confirm probe is unreachable', async () => {
    gitlabGraphql.mockResolvedValue({ status: 503 })
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const stop = installAuthWatch(qc)
    await rejectingQuery(qc, { kind: 'auth', message: 'Unauthorized' })
    await flushPromises()
    expect(sessionState.expired).toBe(false)
    expect(sessionState.unavailable).toBe(true)
    stop()
  })

  it('latches expired when a mutation auth error is confirmed by the probe', async () => {
    gitlabGraphql.mockResolvedValue({ status: 401 })
    const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
    const stop = installAuthWatch(qc)
    const observer = new MutationObserver(qc, {
      mutationFn: () => Promise.reject({ kind: 'auth', message: 'Unauthorized' }),
    })
    await observer.mutate().catch(() => {})
    await flushPromises()
    expect(sessionState.expired).toBe(true)
    stop()
  })

  it('does NOT probe or flip on a non-auth query error', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const stop = installAuthWatch(qc)
    await rejectingQuery(qc, { kind: 'network', message: 'down' })
    await flushPromises()
    expect(sessionState.expired).toBe(false)
    expect(gitlabGraphql).not.toHaveBeenCalled()
    stop()
  })

  it('stops reacting after the returned cleanup runs', async () => {
    gitlabGraphql.mockResolvedValue({ status: 401 })
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const stop = installAuthWatch(qc)
    stop()
    await rejectingQuery(qc, { kind: 'auth', message: 'Unauthorized' })
    await flushPromises()
    expect(sessionState.expired).toBe(false)
    expect(gitlabGraphql).not.toHaveBeenCalled()
  })
})

describe('isUnavailableError', () => {
  it('is true only for kind "unavailable"', () => {
    expect(isUnavailableError({ kind: 'unavailable', message: 'x' })).toBe(true)
    expect(isUnavailableError({ kind: 'auth', message: 'x' })).toBe(false)
    expect(isUnavailableError(null)).toBe(false)
  })

  it('is false for null and non-objects', () => {
    expect(isUnavailableError(undefined)).toBe(false)
    expect(isUnavailableError('unavailable')).toBe(false)
    expect(isUnavailableError(503)).toBe(false)
  })
})

describe('auth wins over unavailable', () => {
  it('markServerUnavailable is a no-op once expired', () => {
    markSessionExpired()
    markServerUnavailable()
    expect(sessionState.expired).toBe(true)
    expect(sessionState.unavailable).toBe(false)
  })

  it('markSessionExpired clears an existing unavailable banner', () => {
    markServerUnavailable()
    expect(sessionState.unavailable).toBe(true)
    markSessionExpired()
    expect(sessionState.expired).toBe(true)
    expect(sessionState.unavailable).toBe(false)
  })

  it('clearServerUnavailable lowers the flag', () => {
    markServerUnavailable()
    clearServerUnavailable()
    expect(sessionState.unavailable).toBe(false)
  })
})

describe('installAuthWatch — unavailable', () => {
  it('flips unavailable when a query fails with an unavailable error', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const stop = installAuthWatch(qc)
    await rejectingQuery(qc, { kind: 'unavailable', message: 'down' })
    expect(sessionState.unavailable).toBe(true)
    expect(sessionState.expired).toBe(false)
    stop()
  })

  it('flips unavailable when a mutation fails with an unavailable error', async () => {
    const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
    const stop = installAuthWatch(qc)
    const observer = new MutationObserver(qc, {
      mutationFn: () => Promise.reject({ kind: 'unavailable', message: 'down' }),
    })
    await observer.mutate().catch(() => {})
    expect(sessionState.unavailable).toBe(true)
    expect(sessionState.expired).toBe(false)
    stop()
  })
})
