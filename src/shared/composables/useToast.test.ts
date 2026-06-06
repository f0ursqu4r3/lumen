import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { pushToast, dismissToast, clearToasts, toasts, TOAST_DURATION } from './useToast'

beforeEach(() => {
  clearToasts()
  vi.useFakeTimers()
})
afterEach(() => vi.useRealTimers())

describe('useToast', () => {
  it('adds a toast with an id and the default info tone', () => {
    const id = pushToast({ title: 'Hi' })
    expect(toasts.value).toHaveLength(1)
    expect(toasts.value[0]).toMatchObject({ id, title: 'Hi', tone: 'info' })
  })

  it('auto-dismisses after the tone-specific duration', () => {
    pushToast({ title: 'Passed', tone: 'success' })
    vi.advanceTimersByTime(TOAST_DURATION.success - 1)
    expect(toasts.value).toHaveLength(1)
    vi.advanceTimersByTime(1)
    expect(toasts.value).toHaveLength(0)
  })

  it('keeps a toast with duration 0 until dismissed manually', () => {
    const id = pushToast({ title: 'Sticky', duration: 0 })
    vi.advanceTimersByTime(60_000)
    expect(toasts.value).toHaveLength(1)
    dismissToast(id)
    expect(toasts.value).toHaveLength(0)
  })

  it('dismiss cancels the pending auto-dismiss timer (no double removal)', () => {
    const id = pushToast({ title: 'X', tone: 'failed' })
    dismissToast(id)
    expect(toasts.value).toHaveLength(0)
    // Advancing past the original duration must not throw or touch state.
    expect(() => vi.advanceTimersByTime(TOAST_DURATION.failed)).not.toThrow()
    expect(toasts.value).toHaveLength(0)
  })
})
