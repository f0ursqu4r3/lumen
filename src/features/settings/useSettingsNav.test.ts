import { describe, it, expect } from 'vitest'
import { SETTINGS_PANES, useSettingsNav } from './useSettingsNav'

describe('settings nav', () => {
  it('lists the panes in order with Appearance before Data & cache', () => {
    expect(SETTINGS_PANES.map((p) => p.id)).toEqual([
      'connection',
      'agent',
      'appearance',
      'data',
      'about',
    ])
  })

  it('selects the first pane by default and can switch', () => {
    const nav = useSettingsNav()
    expect(nav.selected.value).toBe('connection')
    nav.select('agent')
    expect(nav.selected.value).toBe('agent')
  })
})
