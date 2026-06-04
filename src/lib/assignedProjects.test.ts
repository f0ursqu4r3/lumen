import { describe, it, expect } from 'vitest'
import { aggregateAssigned, issueFullPath, type RestIssue } from './assignedProjects'

describe('issueFullPath', () => {
  it('prefers references.full, stripping the issue number', () => {
    expect(issueFullPath({ references: { full: 'grp/sub/proj#42' } })).toBe('grp/sub/proj')
  })

  it('falls back to the web URL when references is missing', () => {
    expect(issueFullPath({ web_url: 'https://gitlab.example.com/grp/proj/-/issues/7' })).toBe(
      'grp/proj',
    )
  })

  it('returns null when neither source resolves a path', () => {
    expect(issueFullPath({})).toBeNull()
    expect(issueFullPath({ references: { full: '' }, web_url: '' })).toBeNull()
  })
})

describe('aggregateAssigned', () => {
  const issue = (full: string): RestIssue => ({ references: { full } })

  it('collapses issues to distinct projects with an open count', () => {
    const out = aggregateAssigned([issue('grp/a#1'), issue('grp/a#2'), issue('grp/b#5')])
    expect(out).toEqual([
      { fullPath: 'grp/a', name: 'a', assignedOpen: 2 },
      { fullPath: 'grp/b', name: 'b', assignedOpen: 1 },
    ])
  })

  it('orders by count desc, then name asc on ties', () => {
    const out = aggregateAssigned([issue('grp/z#1'), issue('grp/m#2'), issue('grp/m#3')])
    expect(out.map((p) => p.fullPath)).toEqual(['grp/m', 'grp/z'])
  })

  it('skips issues with no resolvable project', () => {
    expect(aggregateAssigned([{}, issue('grp/a#1')])).toEqual([
      { fullPath: 'grp/a', name: 'a', assignedOpen: 1 },
    ])
  })
})
