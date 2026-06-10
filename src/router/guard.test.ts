import { describe, it, expect } from 'vitest'
import { nextRoute } from './guard'

describe('nextRoute', () => {
  it('always allows the connect route', () => {
    expect(nextRoute('connect', false)).toBe(true)
  })
  it('allows other routes when configured', () => {
    expect(nextRoute('issues', true)).toBe(true)
  })
  it('redirects to connect when unconfigured', () => {
    expect(nextRoute('issues', false)).toEqual({ name: 'connect' })
  })
  it('allows the settings route regardless of configured state', () => {
    expect(nextRoute('settings', false)).toBe(true)
    expect(nextRoute('settings', true)).toBe(true)
  })
})
