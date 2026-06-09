import { describe, it, expect, vi, beforeEach } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import { withQuery } from '@/test/withQuery'
import type { MrFilters } from '@/features/merge_requests/lib/mrView'

const request = vi.fn()
vi.mock('@/gitlab/client', () => ({ gqlClient: { request: (...a: unknown[]) => request(...a) } }))

import { useMergeRequests } from './useMergeRequests'

const filters: MrFilters = { state: 'opened', labels: [], draft: 'any', sort: 'updated' }

beforeEach(() => request.mockReset())

describe('useMergeRequests', () => {
  it('returns flattened nodes and passes filter args through', async () => {
    request.mockResolvedValue({
      project: {
        mergeRequests: {
          nodes: [{ iid: '5', title: 'Add API', state: 'opened', draft: false }],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      },
    })
    const { result } = withQuery(() =>
      useMergeRequests(ref('grp/proj'), ref({ ...filters, reviewer: 'ray' })),
    )
    await flushPromises()
    expect(result().mergeRequests.value).toHaveLength(1)
    expect(result().mergeRequests.value[0].iid).toBe('5')
    // second positional arg to request() is the variables object
    expect(request.mock.calls[0][1]).toMatchObject({
      fullPath: 'grp/proj',
      state: 'opened',
      sort: 'updated_desc',
      reviewerUsername: 'ray',
    })
  })

  it('normalizes a missing connection to an empty list', async () => {
    request.mockResolvedValue({ project: null })
    const { result } = withQuery(() => useMergeRequests(ref('grp/proj'), ref(filters)))
    await flushPromises()
    expect(result().mergeRequests.value).toEqual([])
  })

  it('fetches the next page with the cursor and flattens both pages', async () => {
    request
      .mockResolvedValueOnce({
        project: {
          mergeRequests: {
            nodes: [{ iid: '5', title: 'Page one', state: 'opened', draft: false }],
            pageInfo: { hasNextPage: true, endCursor: 'cursor-1' },
          },
        },
      })
      .mockResolvedValueOnce({
        project: {
          mergeRequests: {
            nodes: [{ iid: '6', title: 'Page two', state: 'opened', draft: false }],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
      })
    const { result } = withQuery(() => useMergeRequests(ref('grp/proj'), ref(filters)))
    await flushPromises()
    expect(result().hasNextPage.value).toBe(true)

    await result().fetchNextPage()
    await flushPromises()

    expect(request.mock.calls[1][1]).toMatchObject({ after: 'cursor-1' })
    expect(result().mergeRequests.value.map((m) => m.iid)).toEqual(['5', '6'])
  })
})
