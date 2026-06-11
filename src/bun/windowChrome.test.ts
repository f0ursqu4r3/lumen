// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { WINDOW_CHROME } from './windowChrome'

describe('WINDOW_CHROME', () => {
  it('hides the OS titlebar but keeps native inset traffic lights', () => {
    expect(WINDOW_CHROME.titleBarStyle).toBe('hiddenInset')
  })
  it('centers the traffic lights in the 36px chassis bar', () => {
    expect(WINDOW_CHROME.trafficLightOffset).toEqual({ x: 14, y: 12 })
  })
})
