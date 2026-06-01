import { describe, it, expect } from 'vitest'
import { issuesKey, issueKey, toIssuesVars, type IssueFilters } from './issueParams'

describe('issueParams', () => {
  it('builds a stable, filter-aware list key', () => {
    const f: IssueFilters = { state: 'opened' }
    expect(issuesKey('grp/proj', f)).toEqual(['issues', 'grp/proj', f])
  })

  it('builds a detail key from path + iid', () => {
    expect(issueKey('grp/proj', '42')).toEqual(['issue', 'grp/proj', '42'])
  })

  it('omits empty filters and drops state=all', () => {
    const vars = toIssuesVars('grp/proj', { state: 'all', labels: [], search: '' })
    expect(vars).toEqual({ fullPath: 'grp/proj' })
  })

  it('maps populated filters to GraphQL args', () => {
    const vars = toIssuesVars(
      'grp/proj',
      { state: 'closed', labels: ['bug'], assignee: 'kdougan', milestone: 'v1', search: 'crash' },
      'CURSOR',
    )
    expect(vars).toEqual({
      fullPath: 'grp/proj',
      state: 'closed',
      labelName: ['bug'],
      assigneeUsernames: ['kdougan'],
      milestoneTitle: ['v1'],
      search: 'crash',
      after: 'CURSOR',
    })
  })
})
