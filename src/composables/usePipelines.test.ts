import { describe, it, expect, vi, beforeEach } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import { withQuery } from '@/test/withQuery'

const request = vi.fn()
vi.mock('@/gitlab/client', () => ({
  gqlClient: { request: (...a: unknown[]) => request(...a) },
}))

import { usePipelines } from './usePipelines'

beforeEach(() => {
  request.mockReset()
})

const node = (over: Record<string, unknown>) => ({
  id: 'gid://p',
  iid: '1',
  status: 'SUCCESS',
  source: 'push',
  ref: 'main',
  sha: 'abcdef1234',
  path: '/g/p/-/pipelines/1',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: null,
  finishedAt: null,
  duration: null,
  user: null,
  stages: { nodes: [] },
  ...over,
})

describe('usePipelines', () => {
  it('flattens the stage and job connections into plain arrays', async () => {
    request.mockResolvedValue({
      project: {
        pipelines: {
          nodes: [
            node({
              id: 'gid://p1',
              stages: {
                nodes: [
                  {
                    id: 's1',
                    name: 'build',
                    status: 'success',
                    jobs: {
                      nodes: [{ id: 'j1', name: 'compile', status: 'success' }, null],
                    },
                  },
                  null,
                ],
              },
            }),
          ],
        },
      },
    })
    const { result } = withQuery(() => usePipelines(ref('g/p')))
    await flushPromises()
    expect(result().pipelines.value[0].stages).toEqual([
      {
        id: 's1',
        name: 'build',
        status: 'success',
        jobs: [{ id: 'j1', name: 'compile', status: 'success' }],
      },
    ])
  })

  it('defaults jobs to an empty array when the stage omits them', async () => {
    request.mockResolvedValue({
      project: {
        pipelines: {
          nodes: [
            node({
              id: 'gid://p2',
              stages: { nodes: [{ id: 's1', name: 'build', status: 'success' }] },
            }),
          ],
        },
      },
    })
    const { result } = withQuery(() => usePipelines(ref('g/p')))
    await flushPromises()
    expect(result().pipelines.value[0].stages[0].jobs).toEqual([])
  })

  it('sorts running pipelines ahead of finished ones', async () => {
    request.mockResolvedValue({
      project: {
        pipelines: {
          nodes: [
            node({ id: 'done', status: 'SUCCESS', createdAt: '2026-01-03T00:00:00Z' }),
            node({ id: 'run', status: 'RUNNING', createdAt: '2026-01-01T00:00:00Z' }),
          ],
        },
      },
    })
    const { result } = withQuery(() => usePipelines(ref('g/p')))
    await flushPromises()
    expect(result().pipelines.value.map((p) => p.id)).toEqual(['run', 'done'])
  })

  it('exposes a normalized error', async () => {
    request.mockRejectedValue(new Error('down'))
    const { result } = withQuery(() => usePipelines(ref('g/p')))
    await flushPromises()
    expect(result().error.value).toMatchObject({ kind: 'unknown', message: 'down' })
  })
})
