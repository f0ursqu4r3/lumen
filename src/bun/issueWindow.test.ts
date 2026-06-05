import { describe, it, expect } from 'vitest'
import { issueWindowUrl, issuesWindowUrl } from './issueWindow'

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

describe('issuesWindowUrl', () => {
  it('builds a combined-window URL with a comma-joined iids list off the bundled base', () => {
    expect(issuesWindowUrl('views://mainview/index.html', 'grp/proj', ['42', '7', '13'])).toBe(
      'views://mainview/index.html#/projects/grp/proj/issues-window?iids=42,7,13&window=1',
    )
  })

  it('builds off the HMR dev-server base and preserves iid order', () => {
    expect(issuesWindowUrl('http://localhost:5273/index.html', 'grp/proj', ['9', '1'])).toBe(
      'http://localhost:5273/index.html#/projects/grp/proj/issues-window?iids=9,1&window=1',
    )
  })

  it('handles a single iid', () => {
    expect(issuesWindowUrl('views://mainview/index.html', 'grp/sub/proj', ['5'])).toBe(
      'views://mainview/index.html#/projects/grp/sub/proj/issues-window?iids=5&window=1',
    )
  })
})
