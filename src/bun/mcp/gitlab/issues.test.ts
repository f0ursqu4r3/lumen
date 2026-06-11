import { describe, it, expect, vi, beforeEach } from 'vitest'

const c = vi.hoisted(() => ({
  gql: vi.fn(),
  resolveLabelIds: vi.fn(),
  resolveUserIds: vi.fn(),
  resolveMilestoneId: vi.fn(),
}))
vi.mock('./client', () => c)

const { emitInvalidate } = vi.hoisted(() => ({ emitInvalidate: vi.fn() }))
vi.mock('../app/bridge', () => ({ emitInvalidate }))

import { issueTools } from './issues'
const tool = (name: string) => issueTools.find((t) => t.name === name)!
const bodyText = (r: unknown) => (r as { content: Array<{ text: string }> }).content[0].text

beforeEach(() => {
  c.gql.mockReset()
  c.resolveLabelIds.mockReset()
  c.resolveUserIds.mockReset()
  c.resolveMilestoneId.mockReset()
  emitInvalidate.mockReset()
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
    expect(bodyText(res)).toContain('"iid": "5"')
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
    expect(bodyText(res)).toContain('"description": "desc"')
  })

  it('selects the work-item status widget so status is exposed', async () => {
    c.gql.mockResolvedValue({
      project: {
        issue: {
          iid: '5',
          title: 'B',
          state: 'opened',
          webUrl: 'u',
          status: {
            id: 'gid://gitlab/WorkItems::Statuses::SystemDefined::Status/2',
            name: 'In progress',
            category: 'in_progress',
          },
        },
      },
    })
    const res = await tool('lumen_issue_get').handler({ project: 'g/p', iid: '5' })
    expect(c.gql).toHaveBeenCalledWith(expect.stringContaining('status {'), { p: 'g/p', iid: '5' })
    expect(bodyText(res)).toContain('"name": "In progress"')
  })
})

describe('lumen_issue_set_status', () => {
  it('resolves the work item id + status id (case-insensitive), then mutates', async () => {
    c.gql
      .mockResolvedValueOnce({
        project: { workItems: { nodes: [{ id: 'gid://gitlab/WorkItem/100' }] } },
      })
      .mockResolvedValueOnce({
        namespace: {
          statuses: {
            nodes: [
              { id: 'gid://gitlab/Status/1', name: 'To do' },
              { id: 'gid://gitlab/Status/2', name: 'In progress' },
            ],
          },
        },
      })
      .mockResolvedValueOnce({
        workItemUpdate: {
          errors: [],
          workItem: {
            id: 'gid://gitlab/WorkItem/100',
            widgets: [
              {
                status: {
                  id: 'gid://gitlab/Status/2',
                  name: 'In progress',
                  category: 'in_progress',
                },
              },
            ],
          },
        },
      })
    const res = await tool('lumen_issue_set_status').handler({
      project: 'g/p',
      iid: '83',
      status: 'in progress',
    })
    // group path is the project path minus its last segment
    expect(c.gql).toHaveBeenNthCalledWith(2, expect.stringContaining('statuses'), { g: 'g' })
    expect(c.gql).toHaveBeenNthCalledWith(3, expect.stringContaining('workItemUpdate'), {
      id: 'gid://gitlab/WorkItem/100',
      status: 'gid://gitlab/Status/2',
    })
    expect(bodyText(res)).toContain('"name": "In progress"')
  })

  it('errors with the available names when the status is unknown', async () => {
    c.gql
      .mockResolvedValueOnce({
        project: { workItems: { nodes: [{ id: 'gid://gitlab/WorkItem/100' }] } },
      })
      .mockResolvedValueOnce({
        namespace: { statuses: { nodes: [{ id: 'gid://gitlab/Status/1', name: 'To do' }] } },
      })
    const res = await tool('lumen_issue_set_status').handler({
      project: 'g/p',
      iid: '83',
      status: 'Shipped',
    })
    expect(res.isError).toBe(true)
    expect(bodyText(res)).toContain('To do')
    expect(c.gql).toHaveBeenCalledTimes(2) // no mutation fired
  })

  it('errors when the issue has no work item', async () => {
    c.gql.mockResolvedValueOnce({ project: { workItems: { nodes: [] } } })
    const res = await tool('lumen_issue_set_status').handler({
      project: 'g/p',
      iid: '404',
      status: 'Done',
    })
    expect(res.isError).toBe(true)
    expect(c.gql).toHaveBeenCalledTimes(1) // bailed before resolving statuses
  })

  it('surfaces mutation errors', async () => {
    c.gql
      .mockResolvedValueOnce({
        project: { workItems: { nodes: [{ id: 'gid://gitlab/WorkItem/100' }] } },
      })
      .mockResolvedValueOnce({
        namespace: { statuses: { nodes: [{ id: 'gid://gitlab/Status/3', name: 'Done' }] } },
      })
      .mockResolvedValueOnce({
        workItemUpdate: { errors: ['Status is not available'], workItem: null },
      })
    const res = await tool('lumen_issue_set_status').handler({
      project: 'g/p',
      iid: '83',
      status: 'Done',
    })
    expect(res.isError).toBe(true)
    expect(bodyText(res)).toContain('Status is not available')
  })

  it('emits an issue invalidate signal on success', async () => {
    c.gql
      .mockResolvedValueOnce({
        project: { workItems: { nodes: [{ id: 'gid://gitlab/WorkItem/100' }] } },
      })
      .mockResolvedValueOnce({
        namespace: { statuses: { nodes: [{ id: 'gid://gitlab/Status/2', name: 'Done' }] } },
      })
      .mockResolvedValueOnce({
        workItemUpdate: {
          errors: [],
          workItem: {
            widgets: [{ status: { id: 'gid://gitlab/Status/2', name: 'Done', category: 'done' } }],
          },
        },
      })
    await tool('lumen_issue_set_status').handler({ project: 'g/p', iid: '83', status: 'Done' })
    expect(emitInvalidate).toHaveBeenCalledWith({ resource: 'issue', project: 'g/p', iid: '83' })
  })

  it('does not emit when the status is unknown', async () => {
    c.gql
      .mockResolvedValueOnce({
        project: { workItems: { nodes: [{ id: 'gid://gitlab/WorkItem/100' }] } },
      })
      .mockResolvedValueOnce({
        namespace: { statuses: { nodes: [{ id: 'gid://gitlab/Status/1', name: 'To do' }] } },
      })
    await tool('lumen_issue_set_status').handler({ project: 'g/p', iid: '83', status: 'Nope' })
    expect(emitInvalidate).not.toHaveBeenCalled()
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
    expect(bodyText(res)).toContain('"iid": "9"')
  })

  it('returns an error result when the mutation reports errors', async () => {
    c.gql.mockResolvedValue({ createIssue: { issue: null, errors: ['Title is required'] } })
    const res = await tool('lumen_issue_create').handler({ project: 'g/p', title: '' })
    expect(res.isError).toBe(true)
    expect(bodyText(res)).toContain('Title is required')
  })

  it('emits a project-level issue invalidate signal (no iid) on success', async () => {
    c.gql.mockResolvedValue({ createIssue: { issue: { iid: '9', webUrl: 'u' }, errors: [] } })
    await tool('lumen_issue_create').handler({ project: 'g/p', title: 'New' })
    expect(emitInvalidate).toHaveBeenCalledWith({ resource: 'issue', project: 'g/p' })
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

  it('sets assignees via the separate issueSetAssignees mutation with usernames directly', async () => {
    c.gql
      .mockResolvedValueOnce({ updateIssue: { issue: { iid: '5', webUrl: 'u' }, errors: [] } })
      .mockResolvedValueOnce({ issueSetAssignees: { issue: { iid: '5' }, errors: [] } })
    await tool('lumen_issue_update').handler({
      project: 'g/p',
      iid: '5',
      assigneeUsernames: ['ana'],
    })
    expect(c.resolveUserIds).not.toHaveBeenCalled()
    expect(c.gql).toHaveBeenNthCalledWith(2, expect.stringContaining('issueSetAssignees'), {
      input: { projectPath: 'g/p', iid: '5', assigneeUsernames: ['ana'] },
    })
  })

  it('emits an issue invalidate signal on success', async () => {
    c.gql.mockResolvedValue({ updateIssue: { issue: { iid: '5', webUrl: 'u' }, errors: [] } })
    await tool('lumen_issue_update').handler({ project: 'g/p', iid: '5', title: 'X' })
    expect(emitInvalidate).toHaveBeenCalledWith({ resource: 'issue', project: 'g/p', iid: '5' })
  })

  it('does not emit when the update reports errors', async () => {
    c.gql.mockResolvedValue({ updateIssue: { issue: null, errors: ['nope'] } })
    await tool('lumen_issue_update').handler({ project: 'g/p', iid: '5', title: 'X' })
    expect(emitInvalidate).not.toHaveBeenCalled()
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
    expect(bodyText(res)).toContain('Comment added')
  })

  it('returns an error result when the issue is not found', async () => {
    c.gql.mockResolvedValue({ project: { issue: null } })
    const res = await tool('lumen_issue_comment').handler({
      project: 'g/p',
      iid: '404',
      body: 'hi',
    })
    expect(res.isError).toBe(true)
  })

  it('emits an issue invalidate signal on success', async () => {
    c.gql
      .mockResolvedValueOnce({ project: { issue: { id: 'gid://gitlab/Issue/100' } } })
      .mockResolvedValueOnce({ createNote: { note: { id: 'gid://gitlab/Note/1' }, errors: [] } })
    await tool('lumen_issue_comment').handler({ project: 'g/p', iid: '5', body: 'hi' })
    expect(emitInvalidate).toHaveBeenCalledWith({ resource: 'issue', project: 'g/p', iid: '5' })
  })
})
