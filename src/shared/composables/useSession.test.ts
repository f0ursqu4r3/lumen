import { describe, it, expect, beforeEach } from 'vitest'
import { sessionState, isAuthError, markSessionExpired } from './useSession'

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
