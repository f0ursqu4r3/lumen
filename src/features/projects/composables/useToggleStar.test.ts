import { describe, it, expect, vi, beforeEach } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { withQuery } from '@/test/withQuery'
import { useToggleStar } from './useToggleStar'
import { STARRED_KEY, type StarredProject } from './useStarredProjects'

const restPost = vi.fn()
vi.mock('@/gitlab/rest', () => ({ restPost: (p: string) => restPost(p) }))

const pathsIn = (qc: { getQueryData: (k: typeof STARRED_KEY) => unknown }) =>
  ((qc.getQueryData(STARRED_KEY) as StarredProject[]) ?? []).map((p) => p.fullPath)

beforeEach(() => restPost.mockReset())

describe('useToggleStar', () => {
  it('optimistically adds a project and hits the star endpoint', async () => {
    restPost.mockResolvedValue({})
    const { result, queryClient } = withQuery(() => useToggleStar())
    queryClient.setQueryData<StarredProject[]>(STARRED_KEY, [{ name: 'B', fullPath: 'g/b' }])

    result().mutate({ fullPath: 'g/a', name: 'A', starred: false })
    await flushPromises()

    expect(pathsIn(queryClient)).toContain('g/a')
    expect(restPost).toHaveBeenCalledWith('/projects/g%2Fa/star')
  })

  it('optimistically removes a project and hits the unstar endpoint', async () => {
    restPost.mockResolvedValue({})
    const { result, queryClient } = withQuery(() => useToggleStar())
    queryClient.setQueryData<StarredProject[]>(STARRED_KEY, [
      { name: 'A', fullPath: 'g/a' },
      { name: 'B', fullPath: 'g/b' },
    ])

    result().mutate({ fullPath: 'g/a', name: 'A', starred: true })
    await flushPromises()

    expect(pathsIn(queryClient)).toEqual(['g/b'])
    expect(restPost).toHaveBeenCalledWith('/projects/g%2Fa/unstar')
  })
})
