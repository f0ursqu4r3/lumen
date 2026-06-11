import { describe, it, expect } from 'vitest'
import { centerOn, type Display } from './display'

const primary: Display = {
  bounds: { x: 0, y: 0, width: 1440, height: 900 },
  workArea: { x: 0, y: 25, width: 1440, height: 875 },
  isPrimary: true,
}
const secondary: Display = {
  bounds: { x: 1440, y: 0, width: 1000, height: 800 },
  workArea: { x: 1440, y: 0, width: 1000, height: 800 },
  isPrimary: false,
}

describe('centerOn', () => {
  it('centers within the work area of the display containing the anchor', () => {
    const f = centerOn({ width: 820, height: 600 }, [primary, secondary], { x: 1940, y: 400 })
    // secondary workArea: x 1440..2440, y 0..800
    expect(f).toEqual({
      x: 1440 + Math.round((1000 - 820) / 2),
      y: 0 + Math.round((800 - 600) / 2),
      width: 820,
      height: 600,
    })
  })

  it('falls back to the primary display when the anchor is null', () => {
    const f = centerOn({ width: 820, height: 600 }, [primary, secondary], null)
    expect(f.x).toBe(Math.round((1440 - 820) / 2))
    expect(f.y).toBe(25 + Math.round((875 - 600) / 2))
  })

  it('falls back to primary when the anchor is off every display', () => {
    const f = centerOn({ width: 820, height: 600 }, [primary, secondary], { x: 9999, y: 9999 })
    expect(f.x).toBe(Math.round((1440 - 820) / 2))
  })

  it('clamps origin to the work area when the window is larger than the display', () => {
    const f = centerOn({ width: 2000, height: 600 }, [primary], { x: 10, y: 10 })
    expect(f.x).toBe(0) // never negative within the work area
  })

  it('returns the window at origin when there are no displays', () => {
    const f = centerOn({ width: 820, height: 600 }, [], null)
    expect(f).toEqual({ x: 0, y: 0, width: 820, height: 600 })
  })
})
