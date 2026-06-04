import { describe, it, expect, vi, beforeEach } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import { withQuery } from '@/test/withQuery'

const request = vi.fn()
vi.mock('@/gitlab/client', () => ({ gqlClient: { request: (...a: unknown[]) => request(...a) } }))

import { useProjectContributors } from './useProjectContributors'

beforeEach(() => {
  request.mockReset()
})

describe('useProjectContributors', () => {
  it('dedupes MR authors and assignees, dropping bots', async () => {
    request.mockResolvedValue({
      project: {
        mergeRequests: {
          nodes: [
            {
              author: { username: 'ada', name: 'Ada', avatarUrl: null, bot: false },
              assignees: {
                nodes: [
                  { username: 'bob', name: 'Bob', avatarUrl: null, bot: false },
                  { username: 'merge_bot', name: 'Auto merge token', avatarUrl: null, bot: true },
                ],
              },
            },
            {
              author: { username: 'ada', name: 'Ada', avatarUrl: null, bot: false },
              assignees: { nodes: [] },
            },
          ],
        },
      },
    })
    const { result } = withQuery(() => useProjectContributors(ref('grp/proj')))
    await flushPromises()
    expect(result().data.value?.map((u) => u.username)).toEqual(['ada', 'bob'])
  })

  it('exposes a normalized error', async () => {
    request.mockRejectedValue(new Error('down'))
    const { result } = withQuery(() => useProjectContributors(ref('grp/proj')))
    await flushPromises()
    expect(result().error.value).toMatchObject({ kind: 'unknown', message: 'down' })
  })
})
