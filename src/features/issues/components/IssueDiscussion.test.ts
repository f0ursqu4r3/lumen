import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'

// vi.hoisted runs before any imports so we cannot use ref() here.
// We mark each stub with __v_isRef so Vue's proxyRefs() unwraps them
// the same way it would a real ref, giving the template straight value
// access (e.g. `editingNoteId !== n.id` instead of `editingNoteId.value !== n.id`).
// Without this marker, Vue's proxyRefs passes the object through un-unwrapped,
// so template comparisons like `editingNoteId !== n.id` would compare the wrapper
// object (never matching) and v-if branches would render incorrectly.
const disc = vi.hoisted(() => {
  function fakeRef<T>(initial: T) {
    return { __v_isRef: true as const, value: initial }
  }
  return {
    fresh: fakeRef(new Set<string>()),
    replyingTo: fakeRef(null as string | null),
    replyBody: fakeRef(''),
    replyPending: fakeRef(false),
    replyError: fakeRef(null as unknown),
    openReply: vi.fn(),
    cancelReply: vi.fn(),
    submitReply: vi.fn(),
    editingNoteId: fakeRef(null as string | null),
    editBody: fakeRef(''),
    editPending: fakeRef(false),
    editError: fakeRef(null as unknown),
    openEdit: vi.fn(),
    cancelEdit: vi.fn(),
    submitEdit: vi.fn(),
  }
})
vi.mock('@/features/issues/composables/useIssueDiscussion', () => ({
  useIssueDiscussion: () => disc,
}))
const currentUsername = vi.hoisted(() => ({
  __v_isRef: true as const,
  value: 'ada' as string | null,
}))
vi.mock('@/features/dashboard/composables/useCurrentUser', () => ({
  useCurrentUser: () => ({ data: currentUsername }),
}))
vi.mock('@/shared/components/MarkdownText.vue', () => ({
  default: { props: ['source'], template: '<span class="md">{{ source }}</span>' },
}))
vi.mock('@/features/issues/components/MentionTextarea.vue', () => ({
  default: {
    props: ['modelValue'],
    emits: ['update:modelValue'],
    template:
      '<textarea :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
  },
}))

import IssueDiscussion from './IssueDiscussion.vue'

const threads = [
  { id: 'd1', notes: [{ id: 'n1', body: 'mine', createdAt: 't', author: { username: 'ada' } }] },
  { id: 'd2', notes: [{ id: 'n2', body: 'theirs', createdAt: 't', author: { username: 'lin' } }] },
]

function mountDiscussion() {
  return mount(IssueDiscussion, {
    props: {
      threads,
      notes: [{ id: 'n1' }, { id: 'n2' }],
      iid: '7',
      issue: { id: 'gid://Issue/1' },
      fullPath: 'grp/proj',
      members: [],
      comment: '',
    },
  })
}

beforeEach(() => {
  disc.openEdit.mockReset()
  disc.submitEdit.mockReset()
  disc.cancelEdit.mockReset()
  disc.editingNoteId.value = null
  disc.editBody.value = ''
  currentUsername.value = 'ada'
})

describe('IssueDiscussion edit', () => {
  it("shows an Edit control only on the current user's own notes", () => {
    const w = mountDiscussion()
    const editButtons = w.findAll('button').filter((b) => b.text() === 'Edit')
    expect(editButtons).toHaveLength(1)
  })

  it('openEdit fires with the note id and body when Edit is clicked', async () => {
    const w = mountDiscussion()
    await w
      .findAll('button')
      .find((b) => b.text() === 'Edit')!
      .trigger('click')
    expect(disc.openEdit).toHaveBeenCalledWith({ id: 'n1', body: 'mine' })
  })

  it('renders the editor instead of the body for the editing note and saves', async () => {
    disc.editingNoteId.value = 'n1'
    disc.editBody.value = 'mine edited'
    const w = mountDiscussion()
    expect(w.find('textarea').exists()).toBe(true)
    await w
      .findAll('button')
      .find((b) => b.text() === 'Save')!
      .trigger('click')
    expect(disc.submitEdit).toHaveBeenCalledWith('n1')
  })

  it('Cancel button calls cancelEdit', async () => {
    disc.editingNoteId.value = 'n1'
    const w = mountDiscussion()
    await w
      .findAll('button')
      .find((b) => b.text() === 'Cancel')!
      .trigger('click')
    expect(disc.cancelEdit).toHaveBeenCalled()
  })
})
