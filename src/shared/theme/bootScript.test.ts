import { describe, it, expect, beforeEach } from 'vitest'
import { applyStoredTheme } from './applyTheme'

beforeEach(() => {
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
  document.documentElement.style.cssText = ''
})

describe('applyStoredTheme (boot path)', () => {
  it('applies a stored non-default theme before mount', () => {
    localStorage.setItem('lumen:theme', 'gruvbox')
    applyStoredTheme(document, localStorage)
    expect(document.documentElement.getAttribute('data-theme')).toBe('gruvbox')
  })

  it('leaves the default theme attribute-free', () => {
    applyStoredTheme(document, localStorage)
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
  })

  it('applies a stored override (radius) at boot', () => {
    localStorage.setItem('lumen:theme', 'chassis')
    localStorage.setItem('lumen:theme-overrides', JSON.stringify({ radius: 'round' }))
    applyStoredTheme(document, localStorage)
    expect(document.documentElement.style.getPropertyValue('--radius')).toBe('0.625rem')
  })
})
