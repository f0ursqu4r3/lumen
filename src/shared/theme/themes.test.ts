import { describe, it, expect } from 'vitest'
import { THEMES, DEFAULT_THEME_ID, themeById } from './themes'

describe('theme registry', () => {
  it('has 16 themes with unique ids', () => {
    expect(THEMES).toHaveLength(16)
    expect(new Set(THEMES.map((t) => t.id)).size).toBe(16)
  })

  it('default is amber and is the first dark theme', () => {
    expect(DEFAULT_THEME_ID).toBe('amber')
    expect(themeById('amber')?.group).toBe('dark')
    expect(themeById('amber')?.colorScheme).toBe('dark')
  })

  it('every theme has a valid group, colorScheme, and 4 swatch colors', () => {
    for (const t of THEMES) {
      expect(['dark', 'light', 'bold']).toContain(t.group)
      expect(['dark', 'light']).toContain(t.colorScheme)
      expect(t.name.length).toBeGreaterThan(0)
      for (const key of ['bg', 'surface', 'fg', 'accent'] as const) {
        expect(t.swatch[key]).toMatch(/^oklch\(/)
      }
    }
  })

  it('themeById returns undefined for unknown ids', () => {
    expect(themeById('nope')).toBeUndefined()
  })
})
