import { describe, it, expect, vi, beforeEach } from 'vitest'

const { gitlabGraphql, gitlabRest } = vi.hoisted(() => ({
  gitlabGraphql: vi.fn(),
  gitlabRest: vi.fn(),
}))
vi.mock('../../gitlab', () => ({ gitlabGraphql, gitlabRest }))

import { gql, rest, resolveLabelIds, resolveUserIds, resolveMilestoneId } from './client'

beforeEach(() => {
  gitlabGraphql.mockReset()
  gitlabRest.mockReset()
})

describe('gql', () => {
  it('returns data on a clean 200', async () => {
    gitlabGraphql.mockResolvedValue({ status: 200, data: { ok: 1 } })
    expect(await gql('query{x}')).toEqual({ ok: 1 })
  })
  it('throws auth on 401', async () => {
    gitlabGraphql.mockResolvedValue({ status: 401 })
    await expect(gql('query{x}')).rejects.toThrow(/authentication/i)
  })
  it('throws unavailable on a bodyless 403 and on 5xx', async () => {
    gitlabGraphql.mockResolvedValue({ status: 403 })
    await expect(gql('query{x}')).rejects.toThrow(/unavailable/i)
    gitlabGraphql.mockResolvedValue({ status: 503 })
    await expect(gql('query{x}')).rejects.toThrow(/unavailable/i)
  })
  it('surfaces the first GraphQL error message on a 200-with-errors', async () => {
    gitlabGraphql.mockResolvedValue({ status: 200, errors: [{ message: 'Field x missing' }] })
    await expect(gql('query{x}')).rejects.toThrow('Field x missing')
  })
})

describe('rest', () => {
  it('throws on a non-ok response', async () => {
    gitlabRest.mockResolvedValue({ ok: false, status: 404, statusText: 'Not Found', body: '' })
    await expect(rest('POST', '/v4/projects/x/merge_requests/1/approve')).rejects.toThrow(/404/)
  })
  it('resolves on ok', async () => {
    gitlabRest.mockResolvedValue({ ok: true, status: 200, statusText: 'OK', body: '{}' })
    await expect(rest('POST', '/v4/x')).resolves.toBeUndefined()
  })
})

describe('resolvers', () => {
  it('resolveLabelIds maps titles to label GlobalIDs', async () => {
    gitlabGraphql.mockResolvedValue({
      status: 200,
      data: { project: { labels: { nodes: [{ id: 'gid://gitlab/Label/1', title: 'bug' }] } } },
    })
    expect(await resolveLabelIds('g/p', ['bug'])).toEqual(['gid://gitlab/Label/1'])
  })
  it('resolveUserIds maps usernames to user GlobalIDs', async () => {
    gitlabGraphql.mockResolvedValue({
      status: 200,
      data: {
        project: {
          projectMembers: { nodes: [{ user: { id: 'gid://gitlab/User/7', username: 'ana' } }] },
        },
      },
    })
    expect(await resolveUserIds('g/p', ['ana'])).toEqual(['gid://gitlab/User/7'])
  })
  it('resolveMilestoneId maps a title to a milestone GlobalID', async () => {
    gitlabGraphql.mockResolvedValue({
      status: 200,
      data: {
        project: { milestones: { nodes: [{ id: 'gid://gitlab/Milestone/3', title: 'v1' }] } },
      },
    })
    expect(await resolveMilestoneId('g/p', 'v1')).toBe('gid://gitlab/Milestone/3')
  })
})
