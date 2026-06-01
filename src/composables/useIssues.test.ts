import { describe, it, expect, vi, beforeEach } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import { withQuery } from '@/test/withQuery'

const request = vi.fn()
vi.mock('@/gitlab/client', () => ({ gqlClient: { request: (...a: unknown[]) => request(...a) } }))

import { useIssues } from './useIssues'

beforeEach(() => {
  request.mockReset()
})

describe('useIssues', () => {
  it('returns nodes and pageInfo for a project', async () => {
    request.mockResolvedValue({
      project: {
        issues: {
          nodes: [{ iid: '1', title: 'Bug', state: 'opened', webUrl: '#', labels: { nodes: [] }, assignees: { nodes: [] } }],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      },
    })
    const { result } = withQuery(() => useIssues(ref('grp/proj'), ref({ state: 'opened' })))
    await flushPromises()
    expect(result().issues.value).toHaveLength(1)
    expect(result().hasNextPage.value).toBe(false)
  })

  it('passes mapped filter variables to the request', async () => {
    request.mockResolvedValue({ project: { issues: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } } } })
    withQuery(() => useIssues(ref('grp/proj'), ref({ search: 'crash' })))
    await flushPromises()
    expect(request).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ fullPath: 'grp/proj', search: 'crash' }))
  })
})
