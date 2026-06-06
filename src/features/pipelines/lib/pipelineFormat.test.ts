import { describe, it, expect } from 'vitest'
import { formatDuration, shortSha, timeAgo } from '@/features/pipelines/lib/pipelineFormat'

describe('pipelineFormat', () => {
  it('formatDuration: null → empty, sub-minute → seconds, else m s', () => {
    expect(formatDuration(null)).toBe('')
    expect(formatDuration(45)).toBe('45s')
    expect(formatDuration(125)).toBe('2m 5s')
  })
  it('shortSha: first 8 chars, null → empty', () => {
    expect(shortSha('0123456789abcdef')).toBe('01234567')
    expect(shortSha(null)).toBe('')
  })
  it('timeAgo: returns a relative string for a recent time', () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60_000).toISOString()
    expect(timeAgo(fiveMinAgo)).toMatch(/minute/)
  })
})
