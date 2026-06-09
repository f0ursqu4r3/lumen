import { describe, it, expect, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { withQuery } from '@/test/withQuery'

const request = vi.fn()
vi.mock('@/gitlab/client', () => ({ gqlClient: { request: (...a: unknown[]) => request(...a) } }))

import { useAssignedMergeRequests } from './useAssignedMergeRequests'
import { useReviewRequestedMergeRequests } from './useReviewRequestedMergeRequests'

const node = {
  iid: '5',
  title: 'Add API',
  state: 'opened',
  draft: false,
  webUrl: '#',
  updatedAt: 't',
  project: { fullPath: 'g/p' },
  approved: false,
  approvalsRequired: 1,
  reviewers: { nodes: [] },
}

describe('useAssignedMergeRequests', () => {
  it('maps currentUser.assignedMergeRequests nodes', async () => {
    request.mockReset()
    request.mockResolvedValue({
      currentUser: { assignedMergeRequests: { nodes: [node], pageInfo: { hasNextPage: false } } },
    })
    const { result } = withQuery(() => useAssignedMergeRequests())
    await flushPromises()
    expect(result().mrs.value).toHaveLength(1)
    expect(result().mrs.value[0].iid).toBe('5')
    expect(request.mock.calls[0][0]).toContain('assignedMergeRequests')
  })
})

describe('useReviewRequestedMergeRequests', () => {
  it('maps currentUser.reviewRequestedMergeRequests nodes', async () => {
    request.mockReset()
    request.mockResolvedValue({
      currentUser: {
        reviewRequestedMergeRequests: { nodes: [node], pageInfo: { hasNextPage: true } },
      },
    })
    const { result } = withQuery(() => useReviewRequestedMergeRequests())
    await flushPromises()
    expect(result().mrs.value).toHaveLength(1)
    expect(result().hasMore.value).toBe(true)
    expect(request.mock.calls[0][0]).toContain('reviewRequestedMergeRequests')
  })

  it('normalizes errors to an empty list with an error', async () => {
    request.mockReset()
    request.mockRejectedValue(new Error('boom'))
    const { result } = withQuery(() => useReviewRequestedMergeRequests())
    await flushPromises()
    expect(result().mrs.value).toEqual([])
    expect(result().error.value).toMatchObject({ kind: 'unknown', message: 'boom' })
  })
})
