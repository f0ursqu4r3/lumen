import { describe, it, expect } from 'vitest'
import { nextRoute } from './guard'

describe('nextRoute', () => {
  it('always allows the settings route', () => {
    expect(nextRoute('settings', false)).toBe(true)
  })
  it('allows other routes when configured', () => {
    expect(nextRoute('issues', true)).toBe(true)
  })
  it('redirects to settings when unconfigured', () => {
    expect(nextRoute('issues', false)).toEqual({ name: 'settings' })
  })
})
