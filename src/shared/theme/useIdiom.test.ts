import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { ThemeState } from '@/shared/lib/rpcContract'

// Mirror the host: broadcastTheme re-dispatches to every window INCLUDING the
// originator (src/bun/index.ts), which is how a second useTheme() instance —
// the one inside useIdiom() — keeps its refs in sync with the caller's.
const broadcastTheme = vi.fn().mockImplementation(async (state: ThemeState) => {
  window.dispatchEvent(new CustomEvent('lumen:theme-changed', { detail: state }))
  return { ok: true }
})
vi.mock('@/shared/lib/rpc', () => ({
  rpc: { broadcastTheme: (a: ThemeState) => broadcastTheme(a) },
}))

import { useTheme } from './useTheme'
import { useIdiom } from './useIdiom'
import { DEFAULT_THEME_ID } from './themes'

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
  document.documentElement.removeAttribute('data-idiom')
  document.documentElement.style.cssText = ''
})

describe('useIdiom', () => {
  it('is null for the default theme and "terminal" for phosphor', async () => {
    const { setTheme } = useTheme()
    const idiom = useIdiom()
    await setTheme(DEFAULT_THEME_ID)
    expect(idiom.value).toBeNull()
    await setTheme('phosphor')
    expect(idiom.value).toBe('terminal')
    await setTheme(DEFAULT_THEME_ID)
    expect(idiom.value).toBeNull()
  })
})
