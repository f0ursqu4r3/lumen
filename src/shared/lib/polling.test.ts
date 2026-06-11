import { describe, it, expect, afterEach } from 'vitest'
import { sessionState } from '@/shared/composables/useSession'
import { pollInterval, pollOnFocus } from './polling'

function setVisibility(value: 'visible' | 'hidden'): void {
  Object.defineProperty(document, 'visibilityState', { value, configurable: true })
}

afterEach(() => {
  sessionState.unavailable = false
  sessionState.expired = false
  setVisibility('visible')
})

describe('pollInterval', () => {
  it('polls within ±15% of the base when healthy and visible', () => {
    const next = pollInterval(30_000)
    for (let i = 0; i < 100; i++) {
      const ms = next()
      expect(ms).not.toBe(false)
      expect(ms as number).toBeGreaterThanOrEqual(25_500) // 30000 * 0.85
      expect(ms as number).toBeLessThanOrEqual(34_500) // 30000 * 1.15
    }
  })

  it('pauses (false) while the server is unavailable', () => {
    sessionState.unavailable = true
    expect(pollInterval(30_000)()).toBe(false)
  })

  it('pauses (false) while the session is expired', () => {
    sessionState.expired = true
    expect(pollInterval(30_000)()).toBe(false)
  })

  it('pauses (false) while the window is hidden', () => {
    setVisibility('hidden')
    expect(pollInterval(30_000)()).toBe(false)
  })
})

describe('pollOnFocus', () => {
  it('refetches on focus when healthy', () => {
    expect(pollOnFocus()()).toBe(true)
  })

  it('does not refetch on focus while unavailable', () => {
    sessionState.unavailable = true
    expect(pollOnFocus()()).toBe(false)
  })

  it('does not refetch on focus while expired', () => {
    sessionState.expired = true
    expect(pollOnFocus()()).toBe(false)
  })
})
