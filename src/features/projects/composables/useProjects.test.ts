import { describe, it, expect, vi, beforeEach } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import { withQuery } from '@/test/withQuery'

const request = vi.fn()
vi.mock('@/gitlab/client', () => ({
  gqlClient: { request: (...a: unknown[]) => request(...a) },
}))

import { useProjects } from './useProjects'

beforeEach(() => {
  request.mockReset()
})

describe('useProjects', () => {
  it('flattens the paged project nodes', async () => {
    request.mockResolvedValue({
      projects: {
        nodes: [{ id: 'gid://1', fullPath: 'grp/proj', name: 'Proj' }],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    })
    const { result } = withQuery(() => useProjects(ref('proj')))
    await flushPromises()
    expect(result().projects.value).toEqual([{ id: 'gid://1', fullPath: 'grp/proj', name: 'Proj' }])
  })

  it('paginates with the endCursor when more pages exist', async () => {
    request
      .mockResolvedValueOnce({
        projects: {
          nodes: [{ id: 'gid://1', fullPath: 'grp/a', name: 'A' }],
          pageInfo: { hasNextPage: true, endCursor: 'CUR' },
        },
      })
      .mockResolvedValueOnce({
        projects: {
          nodes: [{ id: 'gid://2', fullPath: 'grp/b', name: 'B' }],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      })
    const { result } = withQuery(() => useProjects(ref('')))
    await flushPromises()
    await result().fetchNextPage()
    await flushPromises()

    expect(result().projects.value.map((p) => p.fullPath)).toEqual(['grp/a', 'grp/b'])
    // Second request must carry the cursor returned by the first page.
    expect(request.mock.calls[1][1]).toMatchObject({ after: 'CUR' })
  })

  it('exposes a normalized error', async () => {
    request.mockRejectedValue(new Error('down'))
    const { result } = withQuery(() => useProjects(ref('')))
    await flushPromises()
    expect(result().error.value).toMatchObject({
      kind: 'unknown',
      message: 'down',
    })
  })
})
