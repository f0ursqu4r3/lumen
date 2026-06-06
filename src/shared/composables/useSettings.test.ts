import { describe, it, expect, beforeEach } from 'vitest'
import {
  settingsState,
  openSettings,
  closeSettings,
  registerSettingsShortcut,
  OPEN_SETTINGS_EVENT,
} from './useSettings'

beforeEach(() => {
  settingsState.open = false
})

describe('useSettings', () => {
  it('opens and closes', () => {
    openSettings()
    expect(settingsState.open).toBe(true)
    closeSettings()
    expect(settingsState.open).toBe(false)
  })

  it('opens when the lumen:open-settings event fires after registration', () => {
    const stop = registerSettingsShortcut()
    window.dispatchEvent(new CustomEvent(OPEN_SETTINGS_EVENT))
    expect(settingsState.open).toBe(true)
    stop()
  })

  it('stops listening after the returned cleanup runs', () => {
    const stop = registerSettingsShortcut()
    stop()
    window.dispatchEvent(new CustomEvent(OPEN_SETTINGS_EVENT))
    expect(settingsState.open).toBe(false)
  })
})
