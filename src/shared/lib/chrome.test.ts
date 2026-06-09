import { describe, it, expect } from 'vitest'
import { shouldShowChrome } from './chrome'

describe('shouldShowChrome', () => {
  it('shows chrome when the route opts in and is not a popped-out window', () => {
    expect(shouldShowChrome({ meta: { shell: true }, query: {} })).toBe(true)
  })
  it('hides chrome when the route does not opt in', () => {
    expect(shouldShowChrome({ meta: {}, query: {} })).toBe(false)
    expect(shouldShowChrome({ meta: { shell: false }, query: {} })).toBe(false)
  })
  it('hides chrome for a popped-out window even if the route opts in', () => {
    expect(shouldShowChrome({ meta: { shell: true }, query: { window: '1' } })).toBe(false)
  })
})
