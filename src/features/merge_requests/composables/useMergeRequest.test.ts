import { describe, it, expect, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import { withQuery } from '@/test/withQuery'

const request = vi.fn()
vi.mock('@/gitlab/client', () => ({ gqlClient: { request: (...a: unknown[]) => request(...a) } }))

import { useMergeRequest } from './useMergeRequest'

// NOTE: reset inline at the top of each test rather than in a `beforeEach`. With
// a hook, the rejected mock in the error test surfaces as an unhandled rejection
// (vitest fails the test on `Error: boom`) before Vue Query catches it; resetting
// synchronously in-body avoids that microtask-boundary race. Assertions unchanged.
describe('useMergeRequest', () => {
  it('returns the MR with its discussions', async () => {
    request.mockReset()
    request.mockResolvedValue({
      project: {
        mergeRequest: {
          id: 'gid://MR/1',
          iid: '5',
          title: 'Add API',
          state: 'opened',
          draft: false,
          descriptionHtml: '<p>hi</p>',
          sourceBranch: 'feat',
          targetBranch: 'main',
          approved: false,
          approvalsRequired: 1,
          conflicts: false,
          mergeableDiscussionsState: true,
          webUrl: '#',
          createdAt: 't',
          updatedAt: 't',
          author: { name: 'Ada', username: 'ada' },
          assignees: { nodes: [] },
          reviewers: { nodes: [] },
          labels: { nodes: [] },
          milestone: null,
          headPipeline: null,
          discussions: {
            nodes: [
              {
                id: 'd1',
                notes: {
                  nodes: [
                    {
                      id: 'n1',
                      body: 'hey',
                      bodyHtml: '<p>hey</p>',
                      system: false,
                      createdAt: 't',
                      author: { name: 'Ada', username: 'ada' },
                    },
                  ],
                },
              },
            ],
          },
        },
      },
    })
    const { result } = withQuery(() => useMergeRequest(ref('grp/proj'), ref('5')))
    await flushPromises()
    expect(result().data.value?.iid).toBe('5')
    expect(result().data.value?.discussions.nodes?.[0]?.id).toBe('d1')
  })

  it('normalizes errors', async () => {
    request.mockReset()
    request.mockRejectedValue(new Error('boom'))
    const { result } = withQuery(() => useMergeRequest(ref('grp/proj'), ref('5')))
    await flushPromises()
    expect(result().error.value).toMatchObject({ kind: 'unknown', message: 'boom' })
  })
})
