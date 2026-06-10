import { describe, it, expect, vi, beforeEach } from 'vitest'

const c = vi.hoisted(() => ({ gql: vi.fn(), rest: vi.fn() }))
vi.mock('./client', () => c)

import { mrTools } from './mergeRequests'
const tool = (name: string) => mrTools.find((t) => t.name === name)!
const bodyText = (r: unknown) => (r as { content: Array<{ text: string }> }).content[0].text

beforeEach(() => {
  c.gql.mockReset()
  c.rest.mockReset()
})

describe('lumen_mrs_list', () => {
  it('passes filters and returns slim rows', async () => {
    c.gql.mockResolvedValue({
      project: {
        mergeRequests: {
          nodes: [{ iid: '3', title: 'MR', state: 'opened', webUrl: 'u', draft: false }],
          pageInfo: {},
        },
      },
    })
    const res = await tool('lumen_mrs_list').handler({
      project: 'g/p',
      state: 'opened',
      authorUsername: 'ana',
    })
    expect(c.gql).toHaveBeenCalledWith(
      expect.stringContaining('mergeRequests('),
      expect.objectContaining({ p: 'g/p', state: 'opened', authorUsername: 'ana' }),
    )
    expect(bodyText(res)).toContain('"iid": "3"')
  })
})

describe('lumen_mr_get', () => {
  it('returns detail incl. approvals and diff stats', async () => {
    c.gql.mockResolvedValue({
      project: {
        mergeRequest: {
          iid: '3',
          title: 'MR',
          description: 'd',
          approved: false,
          diffStatsSummary: { additions: 1, deletions: 2, fileCount: 1 },
        },
      },
    })
    const res = await tool('lumen_mr_get').handler({ project: 'g/p', iid: '3' })
    expect(c.gql).toHaveBeenCalledWith(expect.stringContaining('mergeRequest('), {
      p: 'g/p',
      iid: '3',
    })
    expect(bodyText(res)).toContain('"approved": false')
  })
})

describe('lumen_mr_comment', () => {
  it('looks up the MR global id then creates a note', async () => {
    c.gql
      .mockResolvedValueOnce({ project: { mergeRequest: { id: 'gid://gitlab/MergeRequest/50' } } })
      .mockResolvedValueOnce({ createNote: { note: { id: 'gid://gitlab/Note/2' }, errors: [] } })
    const res = await tool('lumen_mr_comment').handler({ project: 'g/p', iid: '3', body: 'lgtm' })
    expect(c.gql).toHaveBeenNthCalledWith(2, expect.stringContaining('createNote'), {
      input: { noteableId: 'gid://gitlab/MergeRequest/50', body: 'lgtm' },
    })
    expect(bodyText(res)).toContain('Comment added')
  })

  it('returns an error result when the MR is not found', async () => {
    c.gql.mockResolvedValue({ project: { mergeRequest: null } })
    const res = await tool('lumen_mr_comment').handler({ project: 'g/p', iid: '404', body: 'x' })
    expect(res.isError).toBe(true)
  })
})

describe('lumen_mr_review', () => {
  it('approve hits the REST approve endpoint with the encoded path', async () => {
    c.rest.mockResolvedValue(undefined)
    const res = await tool('lumen_mr_review').handler({
      project: 'group/proj',
      iid: '3',
      action: 'approve',
    })
    expect(c.rest).toHaveBeenCalledWith(
      'POST',
      '/v4/projects/group%2Fproj/merge_requests/3/approve',
    )
    expect(bodyText(res)).toContain('approved')
  })
  it('unapprove hits the unapprove endpoint', async () => {
    c.rest.mockResolvedValue(undefined)
    await tool('lumen_mr_review').handler({ project: 'group/proj', iid: '3', action: 'unapprove' })
    expect(c.rest).toHaveBeenCalledWith(
      'POST',
      '/v4/projects/group%2Fproj/merge_requests/3/unapprove',
    )
  })
})
