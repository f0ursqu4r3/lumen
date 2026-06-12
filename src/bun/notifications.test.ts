import { describe, it, expect, vi, afterEach } from 'vitest'
import { normalizeNotification, showNotificationSafely } from './notifications'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('normalizeNotification', () => {
  it('trims, collapses control whitespace, and drops empty optional fields', () => {
    expect(
      normalizeNotification({
        title: '  Build\nfailed\t ',
        body: ' ',
        subtitle: '\u0000 main ',
        silent: false,
      }),
    ).toEqual({
      title: 'Build failed',
      subtitle: 'main',
      silent: false,
    })
  })

  it('falls back to a safe title and caps long text', () => {
    const n = normalizeNotification({
      title: '',
      body: 'x'.repeat(300),
      subtitle: 'y'.repeat(200),
    })
    expect(n.title).toBe('Lumen')
    expect(n.body).toHaveLength(240)
    expect(n.body?.endsWith('...')).toBe(true)
    expect(n.subtitle).toHaveLength(120)
  })
})

describe('showNotificationSafely', () => {
  it('does not throw when the native notification call fails', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const show = vi.fn(() => {
      throw new Error('native failed')
    })
    expect(showNotificationSafely(show, { title: 'Hi' })).toEqual({ ok: true })
    expect(warn).toHaveBeenCalledWith('Failed to show OS notification', expect.any(Error))
  })
})
