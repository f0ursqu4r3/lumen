import { describe, it, expect, vi, beforeEach } from 'vitest'

const c = vi.hoisted(() => ({ gql: vi.fn() }))
vi.mock('./client', () => c)

import { userTools } from './usersSearch'
const tool = (name: string) => userTools.find((t) => t.name === name)!

beforeEach(() => c.gql.mockReset())

describe('lumen_me', () => {
  it('returns the current user identity', async () => {
    c.gql.mockResolvedValue({ currentUser: { username: 'ana', name: 'Ana', publicEmail: 'a@x' } })
    const res = await tool('lumen_me').handler({})
    expect(c.gql).toHaveBeenCalledWith(expect.stringContaining('currentUser'))
    expect(res.content[0].text).toContain('"username": "ana"')
  })
})

describe('lumen_members_list', () => {
  it('returns project members for assignee/reviewer lookup', async () => {
    c.gql.mockResolvedValue({
      project: { projectMembers: { nodes: [{ user: { username: 'ana', name: 'Ana' } }] } },
    })
    const res = await tool('lumen_members_list').handler({ project: 'g/p', search: 'an' })
    expect(c.gql).toHaveBeenCalledWith(
      expect.stringContaining('projectMembers('),
      expect.objectContaining({ p: 'g/p', search: 'an' }),
    )
    expect(res.content[0].text).toContain('"username": "ana"')
  })
})

describe('lumen_search', () => {
  it('searches issues and MRs within a project', async () => {
    c.gql.mockResolvedValue({
      project: {
        issues: { nodes: [{ iid: '1', title: 'bug here', webUrl: 'u1' }] },
        mergeRequests: { nodes: [{ iid: '2', title: 'fix bug', webUrl: 'u2' }] },
      },
    })
    const res = await tool('lumen_search').handler({ project: 'g/p', query: 'bug' })
    expect(c.gql).toHaveBeenCalledWith(expect.stringContaining('issues(search:$q'), {
      p: 'g/p',
      q: 'bug',
    })
    const out = JSON.parse(res.content[0].text)
    expect(out.issues).toHaveLength(1)
    expect(out.mergeRequests).toHaveLength(1)
  })
})
