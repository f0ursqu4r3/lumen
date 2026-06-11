import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { notifyManager } from '@tanstack/query-core'
import { withQuery } from '@/test/withQuery'

const request = vi.fn()
vi.mock('@/gitlab/client', () => ({ gqlClient: { request: (...a: unknown[]) => request(...a) } }))

import { useMrAddNote, useMrUpdateNote } from './useMrDiscussion'

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

  it('rejects on a mutation-level errors[] payload', async () => {
    request.mockResolvedValue({ createNote: { note: null, errors: ['permission denied'] } })
    const { result } = withQuery(() => useMrAddNote('grp/proj', '5'))
    await expect(
      result().mutateAsync({ noteableId: 'x', discussionId: 'd', body: 'b' }),
    ).rejects.toMatchObject({ kind: 'graphql', message: 'permission denied' })
  })

  it('invalidates the MR detail query on success', async () => {
    request.mockResolvedValue({ createNote: { note: { id: 'n2' }, errors: [] } })
    const { result, queryClient } = withQuery(() => useMrAddNote('grp/proj', '5'))
    const spy = vi.spyOn(queryClient, 'invalidateQueries')
    await result().mutateAsync({ noteableId: 'gid://MR/1', discussionId: 'd1', body: 'ok' })
    await flushPromises()
    expect(spy).toHaveBeenCalledWith({ queryKey: ['merge-request', 'grp/proj', '5'] })
  })
})

describe('useMrUpdateNote', () => {
  it('sends the note id and new body', async () => {
    request.mockResolvedValue({ updateNote: { note: { id: 'n1', body: 'edited' }, errors: [] } })
    const { result } = withQuery(() => useMrUpdateNote('grp/proj', '5'))
    await result().mutateAsync({ id: 'gid://Note/1', body: 'edited' })
    await flushPromises()
    expect(request.mock.calls[0][1]).toEqual({ input: { id: 'gid://Note/1', body: 'edited' } })
  })

  it('rejects on a mutation-level errors[] payload', async () => {
    request.mockResolvedValue({ updateNote: { note: null, errors: ['permission denied'] } })
    const { result } = withQuery(() => useMrUpdateNote('grp/proj', '5'))
    await expect(result().mutateAsync({ id: 'x', body: 'b' })).rejects.toMatchObject({
      kind: 'graphql',
      message: 'permission denied',
    })
  })

  it('surfaces a normalized error on a transport failure', async () => {
    request.mockRejectedValue(new Error('boom'))
    const { result } = withQuery(() => useMrUpdateNote('grp/proj', '5'))
    await expect(result().mutateAsync({ id: 'x', body: 'b' })).rejects.toMatchObject({
      kind: 'unknown',
      message: 'boom',
    })
  })

  it('invalidates the MR detail query on success', async () => {
    request.mockResolvedValue({ updateNote: { note: { id: 'n1', body: 'b' }, errors: [] } })
    const { result, queryClient } = withQuery(() => useMrUpdateNote('grp/proj', '5'))
    const spy = vi.spyOn(queryClient, 'invalidateQueries')
    await result().mutateAsync({ id: 'gid://Note/1', body: 'b' })
    await flushPromises()
    expect(spy).toHaveBeenCalledWith({ queryKey: ['merge-request', 'grp/proj', '5'] })
  })
})
