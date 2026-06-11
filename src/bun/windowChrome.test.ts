// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { WINDOW_CHROME } from './windowChrome'

describe('WINDOW_CHROME', () => {
  it('hides the OS titlebar but keeps native inset traffic lights', () => {
    expect(WINDOW_CHROME.titleBarStyle).toBe('hiddenInset')
  })
  it('never sets a custom traffic-light offset (not fullscreen-safe in electrobun)', () => {
    // Custom repositioning drifts the buttons after a fullscreen round-trip
    // (electrobun#355). Stock AppKit placement is the only stable option —
    // if you need the buttons moved, adapt the ChassisBar CSS instead.
    expect('trafficLightOffset' in WINDOW_CHROME).toBe(false)
  })
})
