import { describe, it, expect, vi, beforeEach } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { withQuery } from '@/test/withQuery'

const request = vi.fn()
vi.mock('@/gitlab/client', () => ({
  gqlClient: { request: (...a: unknown[]) => request(...a) },
}))

import {
  useAddNote,
  useUpdateIssue,
  useCreateIssue,
  useSetAssignees,
  useUpdateNote,
} from './useIssueMutations'

beforeEach(() => {
  request.mockReset()
})

describe('issue mutations', () => {
  it('useAddNote invalidates the issue query on success', async () => {
    request.mockResolvedValue({
      createNote: { note: { id: 'n2' }, errors: [] },
    })
    const { result, queryClient } = withQuery(() => useAddNote('grp/proj', '9'))
    const spy = vi.spyOn(queryClient, 'invalidateQueries')
    result().mutate({ noteableId: 'gid://issue/9', body: 'hi' })
    await flushPromises()
    expect(request).toHaveBeenCalled()
    expect(spy).toHaveBeenCalledWith({ queryKey: ['issue', 'grp/proj', '9'] })
  })

  it('useUpdateIssue throws normalized error on GraphQL errors[]', async () => {
    request.mockResolvedValue({
      updateIssue: { issue: null, errors: ['nope'] },
    })
    const { result } = withQuery(() => useUpdateIssue('grp/proj', '9'))
    await expect(
      (result() as { mutateAsync: (v: unknown) => Promise<unknown> }).mutateAsync({
        stateEvent: 'CLOSE',
      }),
    ).rejects.toMatchObject({ kind: 'graphql', message: 'nope' })
  })

  it('useSetAssignees sends issueSetAssignees input and invalidates the issue', async () => {
    request.mockResolvedValue({
      issueSetAssignees: { issue: { iid: '9' }, errors: [] },
    })
    const { result, queryClient } = withQuery(() => useSetAssignees('grp/proj', '9'))
    const spy = vi.spyOn(queryClient, 'invalidateQueries')
    result().mutate({ assigneeUsernames: ['kdougan'] })
    await flushPromises()
    expect(request).toHaveBeenCalledWith(expect.anything(), {
      input: {
        projectPath: 'grp/proj',
        iid: '9',
        assigneeUsernames: ['kdougan'],
      },
    })
    expect(spy).toHaveBeenCalledWith({ queryKey: ['issue', 'grp/proj', '9'] })
  })

  it('useSetAssignees throws normalized error on GraphQL errors[]', async () => {
    request.mockResolvedValue({
      issueSetAssignees: { issue: null, errors: ['nope'] },
    })
    const { result } = withQuery(() => useSetAssignees('grp/proj', '9'))
    await expect(
      (result() as { mutateAsync: (v: unknown) => Promise<unknown> }).mutateAsync({
        assigneeUsernames: [],
      }),
    ).rejects.toMatchObject({ kind: 'graphql', message: 'nope' })
  })

  it('useCreateIssue invalidates the project issue list', async () => {
    request.mockResolvedValue({
      createIssue: { issue: { iid: '10' }, errors: [] },
    })
    const { result, queryClient } = withQuery(() => useCreateIssue('grp/proj'))
    const spy = vi.spyOn(queryClient, 'invalidateQueries')
    result().mutate({ title: 'New' })
    await flushPromises()
    expect(spy).toHaveBeenCalledWith({ queryKey: ['issues', 'grp/proj'] })
  })

  it('useCreateIssue rejects with a normalized error on GraphQL errors[]', async () => {
    request.mockResolvedValue({
      createIssue: { issue: null, errors: ['bad'] },
    })
    const { result } = withQuery(() => useCreateIssue('grp/proj'))
    await expect(
      (result() as { mutateAsync: (v: unknown) => Promise<unknown> }).mutateAsync({ title: 'x' }),
    ).rejects.toMatchObject({ kind: 'graphql', message: 'bad' })
  })

  it('useCreateIssue forwards labels and assigneeIds in the input', async () => {
    request.mockResolvedValue({ createIssue: { issue: { iid: '11' }, errors: [] } })
    const { result } = withQuery(() => useCreateIssue('grp/proj'))
    result().mutate({
      title: 'New',
      description: 'body',
      labels: ['bug', 'priority::high'],
      assigneeIds: ['gid://user/1'],
    })
    await flushPromises()
    expect(request).toHaveBeenCalledWith(expect.anything(), {
      input: {
        projectPath: 'grp/proj',
        title: 'New',
        description: 'body',
        labels: ['bug', 'priority::high'],
        assigneeIds: ['gid://user/1'],
      },
    })
  })

  it('useAddNote rejects with a normalized error on a transport failure', async () => {
    request.mockRejectedValue(new Error('down'))
    const { result } = withQuery(() => useAddNote('grp/proj', '9'))
    await expect(
      (result() as { mutateAsync: (v: unknown) => Promise<unknown> }).mutateAsync({
        noteableId: 'gid://issue/9',
        body: 'hi',
      }),
    ).rejects.toMatchObject({ kind: 'unknown', message: 'down' })
  })
})

describe('useUpdateNote', () => {
  it('sends the note id and new body', async () => {
    request.mockResolvedValue({ updateNote: { note: { id: 'n1', body: 'edited' }, errors: [] } })
    const { result } = withQuery(() => useUpdateNote('grp/proj', '7'))
    await result().mutateAsync({ id: 'gid://Note/1', body: 'edited' })
    await flushPromises()
    expect(request.mock.calls[0][1]).toEqual({ input: { id: 'gid://Note/1', body: 'edited' } })
  })

  it('rejects on a mutation-level errors[] payload', async () => {
    request.mockResolvedValue({ updateNote: { note: null, errors: ['permission denied'] } })
    const { result } = withQuery(() => useUpdateNote('grp/proj', '7'))
    await expect(result().mutateAsync({ id: 'x', body: 'b' })).rejects.toMatchObject({
      kind: 'graphql',
      message: 'permission denied',
    })
  })

  it('rejects with a normalized error on a transport failure', async () => {
    request.mockRejectedValue(new Error('boom'))
    const { result } = withQuery(() => useUpdateNote('grp/proj', '7'))
    await expect(result().mutateAsync({ id: 'x', body: 'b' })).rejects.toMatchObject({
      kind: 'unknown',
      message: 'boom',
    })
  })

  it('invalidates the issue detail query on success', async () => {
    request.mockResolvedValue({ updateNote: { note: { id: 'n1', body: 'b' }, errors: [] } })
    const { result, queryClient } = withQuery(() => useUpdateNote('grp/proj', '7'))
    const spy = vi.spyOn(queryClient, 'invalidateQueries')
    await result().mutateAsync({ id: 'gid://Note/1', body: 'b' })
    await flushPromises()
    expect(spy).toHaveBeenCalledWith({ queryKey: ['issue', 'grp/proj', '7'] })
  })
})
