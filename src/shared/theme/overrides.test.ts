import { describe, it, expect } from 'vitest'
import { overridesToVars, RADIUS_PRESETS, DENSITY_PRESETS, FONT_PRESETS } from './overrides'

describe('overridesToVars', () => {
  it('returns an empty map for an empty delta', () => {
    expect(overridesToVars({})).toEqual({})
  })

  it('maps accent to --primary and --ring', () => {
    expect(overridesToVars({ accent: 'oklch(0.7 0.13 264)' })).toEqual({
      '--primary': 'oklch(0.7 0.13 264)',
      '--ring': 'oklch(0.7 0.13 264)',
    })
  })

  it('maps radius/density/font presets to their token values', () => {
    expect(overridesToVars({ radius: 'sharp' })['--radius']).toBe(RADIUS_PRESETS.sharp)
    expect(overridesToVars({ density: 'compact' })['--density']).toBe(DENSITY_PRESETS.compact)
    expect(overridesToVars({ font: 'system' })['--font-sans']).toBe(FONT_PRESETS.system)
  })

  it('ignores unknown preset keys (defensive)', () => {
    expect(overridesToVars({ radius: 'bogus' as never })['--radius']).toBeUndefined()
  })
})
