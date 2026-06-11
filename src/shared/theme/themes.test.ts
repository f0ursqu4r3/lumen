import { describe, it, expect } from 'vitest'
import { THEMES, DEFAULT_THEME_ID, themeById } from './themes'

describe('theme registry', () => {
  it('has 17 themes with unique ids', () => {
    expect(THEMES).toHaveLength(17)
    expect(new Set(THEMES.map((t) => t.id)).size).toBe(17)
  })

  it('default is chassis and is the first dark theme', () => {
    expect(DEFAULT_THEME_ID).toBe('chassis')
    expect(themeById('chassis')?.group).toBe('dark')
    expect(themeById('chassis')?.colorScheme).toBe('dark')
  })

  it('no longer registers the legacy amber id', () => {
    expect(themeById('amber')).toBeUndefined()
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

  it('registers phosphor as a dark terminal-idiom theme', () => {
    const t = themeById('phosphor')
    expect(t?.group).toBe('dark')
    expect(t?.idiom).toBe('terminal')
  })

  it('only phosphor carries an idiom', () => {
    expect(THEMES.filter((t) => t.idiom).map((t) => t.id)).toEqual(['phosphor'])
  })

  it('themeById returns undefined for unknown ids', () => {
    expect(themeById('nope')).toBeUndefined()
  })
})
