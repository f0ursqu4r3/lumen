import { describe, it, expect } from 'vitest'
import { issueWindowUrl } from './issueWindow'

describe('issueWindowUrl', () => {
  it('builds a hash route off the bundled views:// base with the windowed flag', () => {
    expect(issueWindowUrl('views://mainview/index.html', 'grp/proj', '7')).toBe(
      'views://mainview/index.html#/projects/grp/proj/issues/7?window=1',
    )
  })

  it('builds a hash route off the HMR dev-server base', () => {
    expect(issueWindowUrl('http://localhost:5273/index.html', 'grp/proj', '7')).toBe(
      'http://localhost:5273/index.html#/projects/grp/proj/issues/7?window=1',
    )
  })

  it('preserves slashes in a nested fullPath (the route matches them in the hash)', () => {
    expect(issueWindowUrl('views://mainview/index.html', 'grp/sub/proj', '42')).toBe(
      'views://mainview/index.html#/projects/grp/sub/proj/issues/42?window=1',
    )
  })
})
