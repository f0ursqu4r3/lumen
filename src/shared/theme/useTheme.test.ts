import { describe, it, expect, beforeEach, vi } from 'vitest'

const broadcastTheme = vi.fn().mockResolvedValue({ ok: true })
vi.mock('@/shared/lib/rpc', () => ({ rpc: { broadcastTheme: (a: unknown) => broadcastTheme(a) } }))

import { useTheme } from './useTheme'
import { THEME_KEY, OVERRIDES_KEY } from './applyTheme'

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
  document.documentElement.style.cssText = ''
})

describe('useTheme', () => {
  it('setTheme persists, applies, and broadcasts', async () => {
    const t = useTheme()
    await t.setTheme('nocturne')
    expect(t.themeId.value).toBe('nocturne')
    expect(localStorage.getItem(THEME_KEY)).toBe('nocturne')
    expect(document.documentElement.getAttribute('data-theme')).toBe('nocturne')
    expect(broadcastTheme).toHaveBeenCalledWith({ themeId: 'nocturne', overrides: {} })
  })

  it('setOverride merges the delta, applies, persists, and broadcasts the full state', async () => {
    const t = useTheme()
    await t.setTheme('amber')
    await t.setOverride({ accent: 'oklch(0.7 0.13 264)' })
    await t.setOverride({ radius: 'round' })
    expect(t.overrides.value).toEqual({ accent: 'oklch(0.7 0.13 264)', radius: 'round' })
    expect(document.documentElement.style.getPropertyValue('--radius')).toBe('1rem')
    expect(JSON.parse(localStorage.getItem(OVERRIDES_KEY)!)).toEqual({
      accent: 'oklch(0.7 0.13 264)',
      radius: 'round',
    })
  })

  it('reset clears overrides', async () => {
    const t = useTheme()
    await t.setOverride({ radius: 'sharp' })
    await t.reset()
    expect(t.overrides.value).toEqual({})
    expect(document.documentElement.style.getPropertyValue('--radius')).toBe('')
  })

  it('seeds reactive state from storage on first use', () => {
    localStorage.setItem(THEME_KEY, 'teal')
    localStorage.setItem(OVERRIDES_KEY, JSON.stringify({ density: 'compact' }))
    const t = useTheme()
    expect(t.themeId.value).toBe('teal')
    expect(t.overrides.value).toEqual({ density: 'compact' })
  })
})
