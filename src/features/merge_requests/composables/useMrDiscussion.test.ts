import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { notifyManager } from '@tanstack/query-core'
import { withQuery } from '@/test/withQuery'

const request = vi.fn()
vi.mock('@/gitlab/client', () => ({ gqlClient: { request: (...a: unknown[]) => request(...a) } }))

import { useMrAddNote } from './useMrDiscussion'

beforeEach(() => {
  request.mockReset()
  // Run TanStack Query notifications synchronously so that mutateAsync
  // rejection is handled before Node's unhandled-rejection detection fires.
  notifyManager.setScheduler((cb) => cb())
})

afterEach(() => {
  notifyManager.setScheduler((cb) => setTimeout(cb, 0))
})

describe('useMrAddNote', () => {
  it('posts a reply with noteableId, discussionId, and body', async () => {
    request.mockResolvedValue({ createNote: { note: { id: 'n2' } } })
    const { result } = withQuery(() => useMrAddNote('grp/proj', '5'))
    await result().mutateAsync({ noteableId: 'gid://MR/1', discussionId: 'd1', body: 'looks good' })
    await flushPromises()
    expect(request.mock.calls[0][1]).toEqual({
      input: { noteableId: 'gid://MR/1', discussionId: 'd1', body: 'looks good' },
    })
  })

  it('surfaces a normalized error', async () => {
    request.mockRejectedValue(new Error('boom'))
    const { result } = withQuery(() => useMrAddNote('grp/proj', '5'))
    await expect(
      result().mutateAsync({ noteableId: 'x', discussionId: 'd', body: 'b' }),
    ).rejects.toMatchObject({ kind: 'unknown', message: 'boom' })
  })
})
