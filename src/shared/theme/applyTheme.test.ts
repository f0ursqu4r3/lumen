import { describe, it, expect, beforeEach } from 'vitest'
import { applyTheme, readStored, writeStored, THEME_KEY, OVERRIDES_KEY } from './applyTheme'

beforeEach(() => {
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
  document.documentElement.style.cssText = ''
})

describe('applyTheme', () => {
  it('omits data-theme for the default and sets color-scheme dark', () => {
    applyTheme(document, { themeId: 'amber', overrides: {} })
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
    expect(document.documentElement.style.colorScheme).toBe('dark')
  })

  it('sets data-theme + color-scheme for a non-default light theme', () => {
    applyTheme(document, { themeId: 'paper', overrides: {} })
    expect(document.documentElement.getAttribute('data-theme')).toBe('paper')
    expect(document.documentElement.style.colorScheme).toBe('light')
  })

  it('applies override vars as inline custom properties and clears stale ones', () => {
    applyTheme(document, { themeId: 'amber', overrides: { accent: 'oklch(0.7 0.13 264)' } })
    expect(document.documentElement.style.getPropertyValue('--primary')).toBe('oklch(0.7 0.13 264)')
    applyTheme(document, { themeId: 'amber', overrides: {} })
    expect(document.documentElement.style.getPropertyValue('--primary')).toBe('')
  })

  it('round-trips through storage', () => {
    writeStored(localStorage, { themeId: 'teal', overrides: { radius: 'round' } })
    expect(localStorage.getItem(THEME_KEY)).toBe('teal')
    expect(JSON.parse(localStorage.getItem(OVERRIDES_KEY)!)).toEqual({ radius: 'round' })
    expect(readStored(localStorage)).toEqual({ themeId: 'teal', overrides: { radius: 'round' } })
  })

  it('readStored falls back to the default when storage is empty', () => {
    expect(readStored(localStorage)).toEqual({ themeId: 'amber', overrides: {} })
  })

  it('readStored tolerates corrupt overrides JSON', () => {
    localStorage.setItem(THEME_KEY, 'teal')
    localStorage.setItem(OVERRIDES_KEY, '{not json')
    expect(readStored(localStorage)).toEqual({ themeId: 'teal', overrides: {} })
  })
})
