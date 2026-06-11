import { describe, it, expect } from 'vitest'
import { buildThemeBroadcastJs } from './themeBroadcast'

describe('buildThemeBroadcastJs', () => {
  it('builds a CustomEvent dispatch carrying the theme state', () => {
    const js = buildThemeBroadcastJs({ themeId: 'teal', overrides: { radius: 'round' } })
    expect(js).toContain("'lumen:theme-changed'")
    expect(js).toContain('"themeId":"teal"')
    expect(js).toContain('"radius":"round"')
  })
})
