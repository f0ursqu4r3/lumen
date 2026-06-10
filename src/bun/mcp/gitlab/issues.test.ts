import { describe, it, expect, vi, beforeEach } from 'vitest'

const c = vi.hoisted(() => ({
  gql: vi.fn(),
  resolveLabelIds: vi.fn(),
  resolveUserIds: vi.fn(),
  resolveMilestoneId: vi.fn(),
}))
vi.mock('./client', () => c)

import { issueTools } from './issues'
const tool = (name: string) => issueTools.find((t) => t.name === name)!

beforeEach(() => {
  c.gql.mockReset()
  c.resolveLabelIds.mockReset()
  c.resolveUserIds.mockReset()
  c.resolveMilestoneId.mockReset()
})

describe('lumen_issues_list', () => {
  it('passes filters and returns slim rows', async () => {
    c.gql.mockResolvedValue({
      project: {
        issues: {
          nodes: [
            {
              iid: '5',
              title: 'Boom',
              state: 'opened',
              webUrl: 'u',
              updatedAt: 't',
              labels: { nodes: [{ title: 'bug' }] },
              assignees: { nodes: [{ username: 'ana' }] },
            },
          ],
        },
      },
    })
    const res = await tool('lumen_issues_list').handler({
      project: 'g/p',
      state: 'opened',
      labels: ['bug'],
      first: 10,
    })
    expect(c.gql).toHaveBeenCalledWith(
      expect.stringContaining('issues('),
      expect.objectContaining({ p: 'g/p', state: 'opened', labelName: ['bug'], first: 10 }),
    )
    expect(res.content[0].text).toContain('"iid": "5"')
  })
})

describe('lumen_issue_get', () => {
  it('queries by iid and includes the description', async () => {
    c.gql.mockResolvedValue({
      project: {
        issue: { iid: '5', title: 'B', description: 'desc', state: 'opened', webUrl: 'u' },
      },
    })
    const res = await tool('lumen_issue_get').handler({ project: 'g/p', iid: '5' })
    expect(c.gql).toHaveBeenCalledWith(expect.stringContaining('issue('), { p: 'g/p', iid: '5' })
    expect(res.content[0].text).toContain('"description": "desc"')
  })
})

describe('lumen_issue_create', () => {
  it('uses label titles directly, resolves assignees + milestone, returns the new issue', async () => {
    c.resolveUserIds.mockResolvedValue(['gid://gitlab/User/7'])
    c.resolveMilestoneId.mockResolvedValue('gid://gitlab/Milestone/3')
    c.gql.mockResolvedValue({ createIssue: { issue: { iid: '9', webUrl: 'u' }, errors: [] } })
    const res = await tool('lumen_issue_create').handler({
      project: 'g/p',
      title: 'New',
      description: 'd',
      labels: ['bug'],
      assigneeUsernames: ['ana'],
      milestoneTitle: 'v1',
    })
    expect(c.resolveLabelIds).not.toHaveBeenCalled() // create uses `labels` titles, not ids
    expect(c.gql).toHaveBeenCalledWith(
      expect.stringContaining('createIssue'),
      expect.objectContaining({
        input: expect.objectContaining({
          projectPath: 'g/p',
          title: 'New',
          description: 'd',
          labels: ['bug'],
          assigneeIds: ['gid://gitlab/User/7'],
          milestoneId: 'gid://gitlab/Milestone/3',
        }),
      }),
    )
    expect(res.content[0].text).toContain('"iid": "9"')
  })

  it('returns an error result when the mutation reports errors', async () => {
    c.gql.mockResolvedValue({ createIssue: { issue: null, errors: ['Title is required'] } })
    const res = await tool('lumen_issue_create').handler({ project: 'g/p', title: '' })
    expect(res.isError).toBe(true)
    expect(res.content[0].text).toContain('Title is required')
  })
})

describe('lumen_issue_update', () => {
  it('maps state to stateEvent and resolves label ids', async () => {
    c.resolveLabelIds.mockResolvedValue(['gid://gitlab/Label/1'])
    c.gql.mockResolvedValue({ updateIssue: { issue: { iid: '5', webUrl: 'u' }, errors: [] } })
    await tool('lumen_issue_update').handler({
      project: 'g/p',
      iid: '5',
      state: 'close',
      labels: ['bug'],
    })
    expect(c.gql).toHaveBeenCalledWith(
      expect.stringContaining('updateIssue'),
      expect.objectContaining({
        input: expect.objectContaining({
          projectPath: 'g/p',
          iid: '5',
          stateEvent: 'CLOSE',
          labelIds: ['gid://gitlab/Label/1'],
        }),
      }),
    )
  })
})

describe('lumen_issue_comment', () => {
  it('looks up the issue global id, then creates a note', async () => {
    c.gql
      .mockResolvedValueOnce({ project: { issue: { id: 'gid://gitlab/Issue/100' } } })
      .mockResolvedValueOnce({ createNote: { note: { id: 'gid://gitlab/Note/1' }, errors: [] } })
    const res = await tool('lumen_issue_comment').handler({ project: 'g/p', iid: '5', body: 'hi' })
    expect(c.gql).toHaveBeenNthCalledWith(2, expect.stringContaining('createNote'), {
      input: { noteableId: 'gid://gitlab/Issue/100', body: 'hi' },
    })
    expect(res.content[0].text).toContain('Comment added')
  })
})
