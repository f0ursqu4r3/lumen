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
    expect(overridesToVars({ radius: 'tight' })['--radius']).toBe('0.125rem')
    expect(overridesToVars({ radius: 'default' })['--radius']).toBe('0.25rem')
    expect(overridesToVars({ radius: 'soft' })['--radius']).toBe('0.375rem')
    expect(overridesToVars({ radius: 'round' })['--radius']).toBe('0.625rem')
    expect(overridesToVars({ radius: 'plush' })['--radius']).toBe('0.875rem')
    expect(overridesToVars({ density: 'condensed' })['--density']).toBe(
      DENSITY_PRESETS.condensed,
    )
    expect(overridesToVars({ density: 'compact' })['--density']).toBe(DENSITY_PRESETS.compact)
    expect(overridesToVars({ density: 'cozy' })['--density']).toBe(DENSITY_PRESETS.cozy)
    expect(overridesToVars({ density: 'spacious' })['--density']).toBe(DENSITY_PRESETS.spacious)
    expect(overridesToVars({ density: 'airy' })['--density']).toBe(DENSITY_PRESETS.airy)
    expect(overridesToVars({ font: 'system' })['--font-sans']).toBe(FONT_PRESETS.system)
    expect(overridesToVars({ font: 'rounded' })['--font-sans']).toBe(FONT_PRESETS.rounded)
    expect(overridesToVars({ font: 'classic' })['--font-sans']).toBe(FONT_PRESETS.classic)
    expect(FONT_PRESETS.geist).not.toBe(FONT_PRESETS.code)
    expect(overridesToVars({ font: 'code' })['--font-sans']).toBe(FONT_PRESETS.code)
  })

  it('ignores unknown preset keys (defensive)', () => {
    expect(overridesToVars({ radius: 'bogus' as never })['--radius']).toBeUndefined()
  })
})
