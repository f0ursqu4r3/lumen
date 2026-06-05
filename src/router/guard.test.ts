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
})
