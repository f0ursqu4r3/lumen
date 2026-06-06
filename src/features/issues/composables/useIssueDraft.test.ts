import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref, nextTick } from 'vue'
import { withQuery } from '@/test/withQuery'

const { updateAsync, setAsync, addNoteAsync, setStatusAsync, statusState } = vi.hoisted(() => ({
  updateAsync: vi.fn(),
  setAsync: vi.fn(),
  addNoteAsync: vi.fn(),
  setStatusAsync: vi.fn(),
  statusState: { value: { workItemId: 'gid://wi/9', status: null } as Record<string, unknown> },
}))
vi.mock('@/features/issues/composables/useIssueMutations', () => ({
  useUpdateIssue: () => ({
    mutateAsync: updateAsync,
    isPending: { value: false },
    error: { value: null },
  }),
  useSetAssignees: () => ({
    mutateAsync: setAsync,
    isPending: { value: false },
    error: { value: null },
  }),
  useAddNote: () => ({
    mutateAsync: addNoteAsync,
    isPending: { value: false },
    error: { value: null },
  }),
}))
vi.mock('@/features/issues/composables/useWorkItemStatus', () => ({
  useWorkItemStatus: () => ({ data: statusState }),
  useSetWorkItemStatus: () => ({
    mutateAsync: setStatusAsync,
    isPending: { value: false },
    error: { value: null },
  }),
}))

import { useIssueDraft } from './useIssueDraft'

const issue = {
  id: 'gid://issue/9',
  title: 'Bug',
  description: 'desc',
  state: 'opened',
  labels: { nodes: [{ id: 'l1' }] },
  assignees: { nodes: [{ username: 'ada' }] },
}

beforeEach(() => {
  updateAsync.mockReset().mockResolvedValue({})
  setAsync.mockReset().mockResolvedValue({})
  addNoteAsync.mockReset().mockResolvedValue({})
  setStatusAsync.mockReset().mockResolvedValue({})
  statusState.value = { workItemId: 'gid://wi/9', status: null }
})

describe('useIssueDraft', () => {
  it('seeds the draft from the issue and starts clean', () => {
    const issueRef = ref({ ...issue })
    const { result } = withQuery(() => useIssueDraft('grp/proj', '9', issueRef))
    expect(result().draft.value?.title).toBe('Bug')
    expect(result().dirty.value).toBe(false)
  })

  it('becomes dirty on edit and clean after reset', async () => {
    const issueRef = ref({ ...issue })
    const { result } = withQuery(() => useIssueDraft('grp/proj', '9', issueRef))
    result().draft.value!.title = 'New'
    await nextTick()
    expect(result().dirty.value).toBe(true)
    result().reset()
    await nextTick()
    expect(result().dirty.value).toBe(false)
    expect(result().draft.value?.title).toBe('Bug')
  })

  it('save dispatches only the changed mutations', async () => {
    const issueRef = ref({ ...issue })
    const { result } = withQuery(() => useIssueDraft('grp/proj', '9', issueRef))
    result().draft.value!.title = 'New'
    result().draft.value!.assigneeUsernames = ['ada', 'bob']
    await nextTick()
    await result().save()
    expect(updateAsync).toHaveBeenCalledWith({ title: 'New' })
    expect(setAsync).toHaveBeenCalledWith({
      assigneeUsernames: ['ada', 'bob'],
    })
  })

  it('buffers a status change and persists it on save (nothing applied early)', async () => {
    statusState.value = { workItemId: 'gid://wi/9', status: { id: 'gid://s/1' } }
    const issueRef = ref({ ...issue })
    const { result } = withQuery(() => useIssueDraft('grp/proj', '9', issueRef))
    await nextTick()
    // Seeded clean from the current status; selecting a new one buffers it.
    expect(result().dirty.value).toBe(false)
    result().draft.value!.statusId = 'gid://s/2'
    await nextTick()
    expect(result().dirty.value).toBe(true)
    expect(setStatusAsync).not.toHaveBeenCalled() // not hot — waits for save
    await result().save()
    expect(setStatusAsync).toHaveBeenCalledWith({
      workItemId: 'gid://wi/9',
      statusId: 'gid://s/2',
    })
    expect(result().dirty.value).toBe(false)
  })

  it('save with only metadata change does not call setStatus', async () => {
    statusState.value = { workItemId: 'gid://wi/9', status: { id: 'gid://s/1' } }
    const issueRef = ref({ ...issue })
    const { result } = withQuery(() => useIssueDraft('grp/proj', '9', issueRef))
    result().draft.value!.description = 'd2'
    await nextTick()
    await result().save()
    expect(setStatusAsync).not.toHaveBeenCalled()
  })

  it('save with only metadata change does not call setAssignees', async () => {
    const issueRef = ref({ ...issue })
    const { result } = withQuery(() => useIssueDraft('grp/proj', '9', issueRef))
    result().draft.value!.description = 'd2'
    await nextTick()
    await result().save()
    expect(updateAsync).toHaveBeenCalledWith({ description: 'd2' })
    expect(setAsync).not.toHaveBeenCalled()
  })

  it('clears dirty after a successful save', async () => {
    const issueRef = ref({ ...issue })
    const { result } = withQuery(() => useIssueDraft('grp/proj', '9', issueRef))
    result().draft.value!.title = 'New'
    await nextTick()
    expect(result().dirty.value).toBe(true)
    await result().save()
    await nextTick()
    expect(result().dirty.value).toBe(false)
  })

  it('keeps dirty when a save mutation fails', async () => {
    updateAsync.mockRejectedValueOnce(new Error('boom'))
    const issueRef = ref({ ...issue })
    const { result } = withQuery(() => useIssueDraft('grp/proj', '9', issueRef))
    result().draft.value!.title = 'New'
    await nextTick()
    await result().save()
    await nextTick()
    expect(result().dirty.value).toBe(true)
  })

  it('re-syncs from the server only while clean', async () => {
    const issueRef = ref({ ...issue })
    const { result } = withQuery(() => useIssueDraft('grp/proj', '9', issueRef))
    // dirty edit must survive a background refetch
    result().draft.value!.title = 'Mine'
    await nextTick()
    issueRef.value = { ...issue, title: 'Server' }
    await nextTick()
    expect(result().draft.value?.title).toBe('Mine')
    // when clean, a refetch updates the draft
    result().reset()
    issueRef.value = { ...issue, title: 'Server2' }
    await nextTick()
    expect(result().draft.value?.title).toBe('Server2')
  })

  it('a pending comment marks the draft dirty', async () => {
    const issueRef = ref({ ...issue })
    const { result } = withQuery(() => useIssueDraft('grp/proj', '9', issueRef))
    expect(result().dirty.value).toBe(false)
    result().comment.value = 'hello'
    await nextTick()
    expect(result().dirty.value).toBe(true)
  })

  it('save posts the comment then clears it', async () => {
    const issueRef = ref({ ...issue })
    const { result } = withQuery(() => useIssueDraft('grp/proj', '9', issueRef))
    result().comment.value = 'a note'
    await nextTick()
    await result().save()
    expect(addNoteAsync).toHaveBeenCalledWith({
      noteableId: 'gid://issue/9',
      body: 'a note',
    })
    expect(result().comment.value).toBe('')
    expect(result().dirty.value).toBe(false)
  })

  it('a comment-only save does not call field mutations', async () => {
    const issueRef = ref({ ...issue })
    const { result } = withQuery(() => useIssueDraft('grp/proj', '9', issueRef))
    result().comment.value = 'a note'
    await nextTick()
    await result().save()
    expect(updateAsync).not.toHaveBeenCalled()
    expect(setAsync).not.toHaveBeenCalled()
    expect(addNoteAsync).toHaveBeenCalled()
  })

  it('reset clears a pending comment', async () => {
    const issueRef = ref({ ...issue })
    const { result } = withQuery(() => useIssueDraft('grp/proj', '9', issueRef))
    result().comment.value = 'draft note'
    await nextTick()
    result().reset()
    await nextTick()
    expect(result().comment.value).toBe('')
    expect(result().dirty.value).toBe(false)
  })

  it('keeps the comment when the note post fails', async () => {
    addNoteAsync.mockRejectedValueOnce(new Error('boom'))
    const issueRef = ref({ ...issue })
    const { result } = withQuery(() => useIssueDraft('grp/proj', '9', issueRef))
    result().comment.value = 'a note'
    await nextTick()
    await result().save()
    await nextTick()
    expect(result().comment.value).toBe('a note')
    expect(result().dirty.value).toBe(true)
  })
})
