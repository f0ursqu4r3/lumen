import { describe, it, expect } from 'vitest'
import { overridesToVars, DENSITY_PRESETS, FONT_PRESETS } from './overrides'

describe('overridesToVars', () => {
  it('returns an empty map for an empty delta', () => {
    expect(overridesToVars({})).toEqual({})
  })

  it('maps accent to --primary, --ring, and the Phosphor effect color', () => {
    expect(overridesToVars({ accent: 'oklch(0.7 0.13 264)' })).toEqual({
      '--primary': 'oklch(0.7 0.13 264)',
      '--ring': 'oklch(0.7 0.13 264)',
      '--phosphor-effect': 'oklch(0.7 0.13 264)',
    })
  })

  it('maps radius/density/font presets to their token values', () => {
    expect(overridesToVars({ radius: 'sharp' })['--radius']).toBe('0px')
    expect(overridesToVars({ radius: 'default' })['--radius']).toBe('0.25rem')
    expect(overridesToVars({ radius: 'round' })['--radius']).toBe('0.625rem')
    expect(overridesToVars({ density: 'compact' })['--density']).toBe(DENSITY_PRESETS.compact)
    expect(overridesToVars({ font: 'system' })['--font-sans']).toBe(FONT_PRESETS.system)
  })

  it('ignores unknown preset keys (defensive)', () => {
    expect(overridesToVars({ radius: 'bogus' as never })['--radius']).toBeUndefined()
  })
})
