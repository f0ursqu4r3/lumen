import { describe, it, expect, beforeEach } from 'vitest'
import { sessionState, isAuthError, markSessionExpired, installAuthWatch } from './useSession'
import { QueryClient, MutationObserver } from '@tanstack/vue-query'

beforeEach(() => {
  sessionState.expired = false
})

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

describe('installAuthWatch', () => {
  it('flips expired when a query fails with an auth error', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const stop = installAuthWatch(qc)
    await qc
      .fetchQuery({
        queryKey: ['probe'],
        queryFn: () => Promise.reject({ kind: 'auth', message: 'Unauthorized' }),
      })
      .catch(() => {})
    expect(sessionState.expired).toBe(true)
    stop()
  })

  it('does NOT flip on a non-auth query error', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const stop = installAuthWatch(qc)
    await qc
      .fetchQuery({
        queryKey: ['probe'],
        queryFn: () => Promise.reject({ kind: 'network', message: 'down' }),
      })
      .catch(() => {})
    expect(sessionState.expired).toBe(false)
    stop()
  })

  it('flips expired when a mutation fails with an auth error', async () => {
    const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
    const stop = installAuthWatch(qc)
    const observer = new MutationObserver(qc, {
      mutationFn: () => Promise.reject({ kind: 'auth', message: 'Unauthorized' }),
    })
    await observer.mutate().catch(() => {})
    expect(sessionState.expired).toBe(true)
    stop()
  })

  it('stops flipping after the returned cleanup runs', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const stop = installAuthWatch(qc)
    stop()
    await qc
      .fetchQuery({
        queryKey: ['probe'],
        queryFn: () => Promise.reject({ kind: 'auth', message: 'Unauthorized' }),
      })
      .catch(() => {})
    expect(sessionState.expired).toBe(false)
    stop()
  })
})
