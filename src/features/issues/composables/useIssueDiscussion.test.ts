import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref, computed } from 'vue'
import { flushPromises } from '@vue/test-utils'

const add = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  reset: vi.fn(),
  isPending: { value: false },
  error: { value: null as unknown },
}))
const edit = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  reset: vi.fn(),
  isPending: { value: false },
  error: { value: null as unknown },
}))
vi.mock('@/features/issues/composables/useIssueMutations', () => ({
  useAddNote: () => add,
  useUpdateNote: () => edit,
}))

import { useIssueDiscussion } from './useIssueDiscussion'

function setup() {
  return useIssueDiscussion({
    fullPath: 'grp/proj',
    iid: '7',
    issue: computed(() => ({ id: 'gid://Issue/1' })),
    notes: ref([{ id: 'n1' }]),
  })
}

beforeEach(() => {
  add.mutateAsync.mockReset()
  add.reset.mockReset()
  edit.mutateAsync.mockReset()
  edit.reset.mockReset()
  edit.isPending.value = false
  edit.error.value = null
})

describe('useIssueDiscussion edit', () => {
  it('openEdit prefills the body and marks the note as editing', () => {
    const d = setup()
    d.openEdit({ id: 'n1', body: 'hello' })
    expect(d.editingNoteId.value).toBe('n1')
    expect(d.editBody.value).toBe('hello')
  })

  it('submitEdit sends id + trimmed body and clears editing on success', async () => {
    edit.mutateAsync.mockResolvedValue({ note: { id: 'n1', body: 'changed' } })
    const d = setup()
    d.openEdit({ id: 'n1', body: 'hello' })
    d.editBody.value = '  changed  '
    await d.submitEdit('n1')
    await flushPromises()
    expect(edit.mutateAsync).toHaveBeenCalledWith({ id: 'n1', body: 'changed' })
    expect(d.editingNoteId.value).toBe(null)
  })

  it('submitEdit no-ops on an empty body', async () => {
    const d = setup()
    d.openEdit({ id: 'n1', body: 'hello' })
    d.editBody.value = '   '
    await d.submitEdit('n1')
    expect(edit.mutateAsync).not.toHaveBeenCalled()
    expect(d.editingNoteId.value).toBe('n1')
  })

  it('submitEdit keeps editing open when the mutation rejects', async () => {
    edit.mutateAsync.mockRejectedValue({ kind: 'graphql', message: 'nope' })
    const d = setup()
    d.openEdit({ id: 'n1', body: 'hello' })
    d.editBody.value = 'changed'
    await d.submitEdit('n1')
    await flushPromises()
    expect(d.editingNoteId.value).toBe('n1')
  })

  it('cancelEdit clears state', () => {
    const d = setup()
    d.openEdit({ id: 'n1', body: 'hello' })
    d.cancelEdit()
    expect(d.editingNoteId.value).toBe(null)
    expect(d.editBody.value).toBe('')
  })
})
