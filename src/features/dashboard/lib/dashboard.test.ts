import { describe, it, expect } from 'vitest'
import { parseIssuePath, dashboardKeys } from './dashboard'

describe('parseIssuePath', () => {
  it('extracts fullPath + iid from a simple project path', () => {
    expect(parseIssuePath('/grp/proj/-/issues/42')).toEqual({ fullPath: 'grp/proj', iid: '42' })
  })
  it('handles nested groups', () => {
    expect(parseIssuePath('/grp/sub/proj/-/issues/7')).toEqual({
      fullPath: 'grp/sub/proj',
      iid: '7',
    })
  })
  it('returns null for non-issue paths', () => {
    expect(parseIssuePath('/grp/proj/-/merge_requests/3')).toBeNull()
    expect(parseIssuePath('')).toBeNull()
    expect(parseIssuePath(null as unknown as string)).toBeNull()
  })
  it('tolerates a full URL', () => {
    expect(parseIssuePath('https://gitlab.example.com/grp/proj/-/issues/42')).toEqual({
      fullPath: 'grp/proj',
      iid: '42',
    })
  })
  it('tolerates a missing leading slash', () => {
    expect(parseIssuePath('grp/proj/-/issues/42')).toEqual({ fullPath: 'grp/proj', iid: '42' })
  })
})

describe('dashboardKeys', () => {
  it('namespaces the assigned-issues key by username', () => {
    expect(dashboardKeys.assignedIssues('ada')).toEqual(['dashboard', 'assigned-issues', 'ada'])
  })
})
