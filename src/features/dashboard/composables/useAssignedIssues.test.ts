import { describe, it, expect, vi, beforeEach } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import { withQuery } from '@/test/withQuery'

const request = vi.fn()
vi.mock('@/gitlab/client', () => ({ gqlClient: { request: (...a: unknown[]) => request(...a) } }))

import { useAssignedIssues } from './useAssignedIssues'

beforeEach(() => request.mockReset())

describe('useAssignedIssues', () => {
  it('fetches issues for the username and flattens nodes', async () => {
    request.mockResolvedValue({
      issues: {
        nodes: [
          {
            iid: '1',
            title: 'Bug',
            state: 'opened',
            webPath: '/g/p/-/issues/1',
            webUrl: '#',
            updatedAt: 't',
            labels: { nodes: [] },
          },
        ],
        pageInfo: { hasNextPage: false },
      },
    })
    const { result } = withQuery(() => useAssignedIssues(ref('ada')))
    await flushPromises()
    expect(result().issues.value).toHaveLength(1)
    expect(request.mock.calls[0][1]).toEqual({ username: 'ada' })
  })

  it('does not fire a request until the username is known', async () => {
    const { result } = withQuery(() => useAssignedIssues(ref(null)))
    await flushPromises()
    expect(request).not.toHaveBeenCalled()
    expect(result().issues.value).toEqual([])
  })
})
