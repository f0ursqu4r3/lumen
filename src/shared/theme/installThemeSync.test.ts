import { describe, it, expect, beforeEach } from 'vitest'
import { installThemeSync, __resetThemeSync } from './installThemeSync'
import { THEME_KEY } from './applyTheme'
import { DEFAULT_THEME_ID } from './themes'

beforeEach(() => {
  __resetThemeSync()
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
  document.documentElement.style.cssText = ''
})

describe('installThemeSync', () => {
  it('applies and persists a broadcast theme change', () => {
    installThemeSync()
    window.dispatchEvent(
      new CustomEvent('lumen:theme-changed', { detail: { themeId: 'paper', overrides: {} } }),
    )
    expect(document.documentElement.getAttribute('data-theme')).toBe('paper')
    expect(localStorage.getItem(THEME_KEY)).toBe('paper')
  })

  it('applies override vars from a broadcast', () => {
    installThemeSync()
    window.dispatchEvent(
      new CustomEvent('lumen:theme-changed', {
        detail: { themeId: 'chassis', overrides: { radius: 'round' } },
      }),
    )
    expect(document.documentElement.style.getPropertyValue('--radius')).toBe('0.625rem')
  })

  it('ignores malformed events without a themeId', () => {
    installThemeSync()
    window.dispatchEvent(new CustomEvent('lumen:theme-changed', { detail: {} }))
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
    expect(localStorage.getItem(THEME_KEY)).toBeNull()
  })

  it('coerces an unknown broadcast theme id to the default before persisting', () => {
    installThemeSync()
    window.dispatchEvent(
      new CustomEvent('lumen:theme-changed', { detail: { themeId: 'amber', overrides: {} } }),
    )
    expect(localStorage.getItem(THEME_KEY)).toBe(DEFAULT_THEME_ID)
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
  })

  it('installs only once (idempotent)', () => {
    installThemeSync()
    installThemeSync() // second call no-ops
    let count = 0
    const el = document.documentElement
    const orig = el.setAttribute.bind(el)
    el.setAttribute = ((...a: [string, string]) => {
      if (a[0] === 'data-theme') count++
      return orig(...a)
    }) as typeof el.setAttribute
    window.dispatchEvent(
      new CustomEvent('lumen:theme-changed', { detail: { themeId: 'teal', overrides: {} } }),
    )
    el.setAttribute = orig
    expect(count).toBe(1) // one listener fired, not two
  })
})
