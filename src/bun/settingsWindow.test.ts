import { describe, it, expect } from 'vitest'
import { settingsWindowRoute } from './settingsWindow'

describe('settingsWindowRoute', () => {
  it('returns the settings route marked as a native window', () => {
    expect(settingsWindowRoute()).toBe('/settings?window=1')
  })
})
