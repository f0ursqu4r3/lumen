import { describe, it, expect } from 'vitest'
import { issueWindowRoute, issuesWindowRoute } from './issueWindow'

describe('issueWindowRoute', () => {
  it('builds a hash route with the windowed flag', () => {
    expect(issueWindowRoute('grp/proj', '7')).toBe('/projects/grp/proj/issues/7?window=1')
  })

  it('preserves slashes in a nested fullPath (the route matches them in the hash)', () => {
    expect(issueWindowRoute('grp/sub/proj', '42')).toBe('/projects/grp/sub/proj/issues/42?window=1')
  })
})

describe('issuesWindowRoute', () => {
  it('builds a combined-window route with a comma-joined iids list', () => {
    expect(issuesWindowRoute('grp/proj', ['42', '7', '13'])).toBe(
      '/projects/grp/proj/issues-window?iids=42,7,13&window=1',
    )
  })

  it('preserves iid order and handles a single iid', () => {
    expect(issuesWindowRoute('grp/sub/proj', ['5'])).toBe(
      '/projects/grp/sub/proj/issues-window?iids=5&window=1',
    )
  })
})
