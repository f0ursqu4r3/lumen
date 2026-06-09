import { describe, it, expect } from 'vitest'
import { timeAgo } from './time'

describe('timeAgo', () => {
  it('formats a recent time in minutes', () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60_000).toISOString()
    expect(timeAgo(fiveMinAgo)).toMatch(/minute/)
  })
  it('formats hours and days', () => {
    expect(timeAgo(new Date(Date.now() - 3 * 3_600_000).toISOString())).toMatch(/hour/)
    expect(timeAgo(new Date(Date.now() - 2 * 86_400_000).toISOString())).toMatch(/day/)
  })
})
