import { describe, it, expect, vi, beforeEach } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import { withQuery } from '@/test/withQuery'

const request = vi.fn()
vi.mock('@/gitlab/client', () => ({ gqlClient: { request: (...a: unknown[]) => request(...a) } }))

import { useProjectMembers } from './useProjectMembers'

beforeEach(() => {
  request.mockReset()
})

describe('useProjectMembers', () => {
  it('maps the member user nodes, dropping nulls', async () => {
    request.mockResolvedValue({
      project: {
        projectMembers: {
          nodes: [
            { user: { id: 'gid://user/1', username: 'kdougan', name: 'K D', avatarUrl: null } },
            { user: null },
            null,
          ],
        },
      },
    })
    const { result } = withQuery(() => useProjectMembers(ref('grp/proj')))
    await flushPromises()
    expect(result().data.value).toEqual([
      { id: 'gid://user/1', username: 'kdougan', name: 'K D', avatarUrl: null },
    ])
  })

  it('exposes a normalized error', async () => {
    request.mockRejectedValue(new Error('down'))
    const { result } = withQuery(() => useProjectMembers(ref('grp/proj')))
    await flushPromises()
    expect(result().error.value).toMatchObject({ kind: 'unknown', message: 'down' })
  })
})
