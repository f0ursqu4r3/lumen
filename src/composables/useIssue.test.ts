import { describe, it, expect, vi, beforeEach } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import { withQuery } from '@/test/withQuery'

const request = vi.fn()
vi.mock('@/gitlab/client', () => ({
  gqlClient: { request: (...a: unknown[]) => request(...a) },
}))

import { useIssue } from './useIssue'

beforeEach(() => {
  request.mockReset()
})

describe('useIssue', () => {
  it('returns the issue with its notes', async () => {
    request.mockResolvedValue({
      project: {
        issue: {
          id: 'gid://issue/9',
          iid: '9',
          title: 'Bug',
          description: 'desc',
          state: 'opened',
          webUrl: '#',
          milestone: { title: 'v1' },
          labels: { nodes: [] },
          assignees: { nodes: [] },
          notes: {
            nodes: [
              {
                id: 'n1',
                body: 'me too',
                system: false,
                createdAt: '2026-01-01T00:00:00Z',
                author: { username: 'a', avatarUrl: '#' },
              },
            ],
          },
        },
      },
    })
    const { result } = withQuery(() => useIssue(ref('grp/proj'), ref('9')))
    await flushPromises()
    expect(result().data.value?.title).toBe('Bug')
    expect(result().data.value?.notes.nodes).toHaveLength(1)
  })
})
