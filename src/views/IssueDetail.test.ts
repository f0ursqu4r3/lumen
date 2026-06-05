import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises, RouterLinkStub } from '@vue/test-utils'
import { ref } from 'vue'
import { Check } from '@lucide/vue'

const useIssue = vi.fn()
vi.mock('@/composables/useIssue', () => ({ useIssue: () => useIssue() }))

const { draftSave, draftReset, draftState } = vi.hoisted(() => ({
  draftSave: vi.fn(),
  draftReset: vi.fn(),
  draftState: {
    dirty: null as null | { value: boolean },
    comment: null as null | { value: string },
  },
}))
vi.mock('@/composables/useProjectMembers', async () => {
  const { ref } = await import('vue')
  return { useProjectMembers: () => ({ data: ref([]) }) }
})
vi.mock('@/composables/useProjectContributors', async () => {
  const { ref } = await import('vue')
  return { useProjectContributors: () => ({ data: ref([]) }) }
})
vi.mock('@/composables/useProjectLabels', async () => {
  const { ref } = await import('vue')
  return { useProjectLabels: () => ({ data: ref([]) }) }
})
vi.mock('@/composables/useWorkItemStatus', async () => {
  const { ref } = await import('vue')
  // IssueDetail reads only the options list; current value + persistence live in
  // the (mocked) issue draft, so the other exports aren't exercised here.
  return { useWorkItemStatuses: () => ({ data: ref([]) }) }
})
vi.mock('@/composables/useIssueDraft', async () => {
  const { ref, computed } = await import('vue')
  return {
    useIssueDraft: () => {
      const draft = ref({
        title: 'Bug',
        description: 'the description',
        state: 'opened',
        labelIds: [] as string[],
        assigneeUsernames: ['a'],
      })
      // Reuse the existing refs so external mutations (draftState.dirty!.value = true)
      // made before mount are visible to the component.
      if (!draftState.dirty) draftState.dirty = ref(false)
      if (!draftState.comment) draftState.comment = ref('')
      return {
        draft,
        comment: draftState.comment,
        dirty: draftState.dirty,
        saving: computed(() => false),
        error: ref(null),
        save: draftSave,
        reset: draftReset,
      }
    },
  }
})
const { addNoteMutate } = vi.hoisted(() => ({
  addNoteMutate: vi.fn(() => Promise.resolve({ note: { id: 'new' } })),
}))
vi.mock('@/composables/useIssueMutations', async () => {
  const { ref } = await import('vue')
  return {
    useAddNote: () => ({
      mutateAsync: addNoteMutate,
      isPending: ref(false),
      error: ref(null),
      reset: vi.fn(),
    }),
  }
})
vi.mock('vue-router', () => ({ onBeforeRouteLeave: vi.fn() }))

const { openExternal, clipboardWriteText } = vi.hoisted(() => ({
  openExternal: vi.fn(() => Promise.resolve({ ok: true })),
  clipboardWriteText: vi.fn(() => Promise.resolve({ ok: true })),
}))
vi.mock('@/lib/rpc', () => ({ rpc: { openExternal, clipboardWriteText } }))

import IssueDetail from './IssueDetail.vue'

const fullIssue = {
  id: 'gid://issue/9',
  iid: '9',
  title: 'Bug',
  description: 'the description',
  state: 'opened',
  webUrl: '#',
  createdAt: '2026-01-01T00:00:00Z',
  author: { username: 'reporter', avatarUrl: null },
  milestone: { title: 'v1' },
  labels: { nodes: [] },
  assignees: {
    nodes: [{ id: 'u1', name: 'Ada Lovelace', username: 'a', avatarUrl: null }],
  },
  discussions: {
    nodes: [
      {
        id: 'd1',
        notes: {
          nodes: [
            {
              id: 'n1',
              body: 'me too',
              system: false,
              createdAt: '2026-01-01T00:00:00Z',
              author: { username: 'a', avatarUrl: null },
            },
          ],
        },
      },
      {
        id: 'd2',
        notes: {
          nodes: [
            {
              id: 'n2',
              body: 'changed milestone',
              system: true,
              createdAt: '2026-01-01T00:00:00Z',
              author: { username: 'bot', avatarUrl: null },
            },
          ],
        },
      },
    ],
  },
}

const mountDetail = (props: Record<string, unknown> = {}) =>
  mount(IssueDetail, {
    props: { fullPath: 'grp/proj', iid: '9', ...props },
    global: { stubs: { RouterLink: RouterLinkStub } },
  })

beforeEach(() => {
  useIssue.mockReset()
  draftSave.mockReset()
  draftReset.mockReset()
  addNoteMutate.mockClear()
  // Reset shared draft state between tests so mutations from one test don't
  // bleed into the next.
  if (draftState.dirty) draftState.dirty.value = false
  if (draftState.comment) draftState.comment.value = ''
  useIssue.mockReturnValue({
    data: ref(fullIssue),
    isLoading: ref(false),
    error: ref(null),
  })
})

describe('IssueDetail (buffered)', () => {
  it('renders title and description (no editors) by default', async () => {
    const w = mountDetail()
    await flushPromises()
    expect(w.text()).toContain('Bug')
    expect(w.text()).toContain('the description')
    expect(w.text()).toContain('me too')
    expect(w.find('[data-testid="edit-title"]').exists()).toBe(false)
    expect(w.find('textarea[aria-label="Issue description"]').exists()).toBe(false)
  })

  it('links the eyebrow back to this repo issue list when full-page', async () => {
    const w = mountDetail()
    await flushPromises()
    const back = w.find('[data-testid="back-to-issues"]')
    expect(back.exists()).toBe(true)
    expect(back.findComponent(RouterLinkStub).props('to')).toEqual({
      name: 'issues',
      params: { fullPath: 'grp/proj' },
    })
  })

  it('omits the back link when embedded in the drawer', async () => {
    const w = mountDetail({ embedded: true })
    await flushPromises()
    expect(w.find('[data-testid="back-to-issues"]').exists()).toBe(false)
  })

  it('reveals the title input when its Edit toggle is clicked', async () => {
    const w = mountDetail()
    await flushPromises()
    await w.get('[data-testid="edit-title-toggle"]').trigger('click')
    expect((w.find('[data-testid="edit-title"]').element as HTMLInputElement).value).toBe('Bug')
  })

  it('reveals the description textarea when its Edit toggle is clicked', async () => {
    const w = mountDetail()
    await flushPromises()
    await w.get('[data-testid="edit-description-toggle"]').trigger('click')
    expect(w.find('textarea[aria-label="Issue description"]').exists()).toBe(true)
  })

  it('returns fields to rendered after a successful save', async () => {
    draftState.dirty!.value = true
    draftSave.mockImplementation(() => {
      draftState.dirty!.value = false
    })
    const w = mountDetail()
    await flushPromises()
    await w.get('[data-testid="edit-title-toggle"]').trigger('click')
    expect(w.find('[data-testid="edit-title"]').exists()).toBe(true)
    await w.get('[data-testid="save-issue"]').trigger('click')
    await flushPromises()
    expect(w.find('[data-testid="edit-title"]').exists()).toBe(false)
  })

  it('hides system notes', async () => {
    const w = mountDetail()
    await flushPromises()
    expect(w.text()).not.toContain('changed milestone')
  })

  it('posts a reply to a thread with the discussion id', async () => {
    const w = mountDetail()
    await flushPromises()
    // Open the per-thread reply box (the only Reply button until it is open).
    await w
      .findAll('button')
      .find((b) => b.text() === 'Reply')!
      .trigger('click')
    const box = w.find('textarea[aria-label="Write a reply"]')
    expect(box.exists()).toBe(true)
    await box.setValue('on it')
    // Submit — the reply targets the thread (d1), not a new top-level discussion.
    await w
      .findAll('button')
      .find((b) => b.text() === 'Reply')!
      .trigger('click')
    await flushPromises()
    expect(addNoteMutate).toHaveBeenCalledWith({
      noteableId: 'gid://issue/9',
      discussionId: 'd1',
      body: 'on it',
    })
  })

  it('shows the Save/Cancel footer only when dirty', async () => {
    const w = mountDetail()
    await flushPromises()
    expect(w.find('[data-testid="save-issue"]').exists()).toBe(false)
    draftState.dirty!.value = true
    await flushPromises()
    expect(w.find('[data-testid="save-issue"]').exists()).toBe(true)
  })

  it('Save calls draft.save and Cancel calls draft.reset', async () => {
    const w = mountDetail()
    draftState.dirty!.value = true
    await flushPromises()
    await w.get('[data-testid="save-issue"]').trigger('click')
    expect(draftSave).toHaveBeenCalled()
    await w.get('[data-testid="cancel-issue"]').trigger('click')
    expect(draftReset).toHaveBeenCalled()
  })

  it('binds the comment textarea to the draft', async () => {
    const w = mountDetail()
    await flushPromises()
    await w.find('textarea[placeholder="Add a comment…"]').setValue('a new comment')
    expect(draftState.comment!.value).toBe('a new comment')
  })

  it('has no standalone Comment button (Save posts the comment)', async () => {
    const w = mountDetail()
    await flushPromises()
    const hasCommentButton = w.findAll('button').some((b) => b.text() === 'Comment')
    expect(hasCommentButton).toBe(false)
  })

  it('toggling state flips the draft (no immediate mutation)', async () => {
    const w = mountDetail()
    await flushPromises()
    await w.get('[data-testid="toggle-state"]').trigger('click')
    expect(w.get('[data-testid="toggle-state"]').text()).toContain('Reopen')
  })

  it('animates only notes that arrive after the first render (not the initial thread)', async () => {
    const issueRef = ref({ ...fullIssue })
    useIssue.mockReturnValue({ data: issueRef, isLoading: ref(false), error: ref(null) })
    const w = mountDetail()
    await flushPromises()

    const noteFor = (body: string) =>
      w.findAll('[data-testid="note"]').find((n) => n.text().includes(body))
    // The note present at load lands with the section, not its own entrance.
    expect(noteFor('me too')?.classes()).not.toContain('animate-note-in')

    // A poll delivers a new comment (a fresh discussion thread).
    issueRef.value = {
      ...issueRef.value,
      discussions: {
        nodes: [
          ...issueRef.value.discussions.nodes,
          {
            id: 'd3',
            notes: {
              nodes: [
                {
                  id: 'n3',
                  body: 'fresh reply',
                  system: false,
                  createdAt: '2026-01-02T00:00:00Z',
                  author: { username: 'b', avatarUrl: null },
                },
              ],
            },
          },
        ],
      },
    }
    await flushPromises()

    // Only the newcomer animates; the pre-existing note stays put.
    expect(noteFor('fresh reply')?.classes()).toContain('animate-note-in')
    expect(noteFor('me too')?.classes()).not.toContain('animate-note-in')
  })

  describe('the GitLab actions', () => {
    beforeEach(() => {
      openExternal.mockClear()
      clipboardWriteText.mockClear()
    })

    it('opens the issue in the browser via the host (no copy)', async () => {
      const w = mountDetail()
      await flushPromises()
      await w.get('[data-testid="open-in-gitlab"]').trigger('click')
      await flushPromises()
      expect(openExternal).toHaveBeenCalledWith({ url: '#' })
      expect(clipboardWriteText).not.toHaveBeenCalled()
    })

    it('copies the bare URL on a plain Copy click and confirms', async () => {
      const w = mountDetail()
      await flushPromises()
      const copy = w.get('[data-testid="copy-link"]')
      await copy.trigger('click')
      await flushPromises()
      expect(clipboardWriteText).toHaveBeenCalledWith({ text: '#' })
      expect(openExternal).not.toHaveBeenCalled()
      // Confirmation is the icon swapping to a check, not a text label.
      expect(copy.findComponent(Check).exists()).toBe(true)
    })

    it('copies a markdown link on Shift+Click of Copy', async () => {
      const w = mountDetail()
      await flushPromises()
      const copy = w.get('[data-testid="copy-link"]')
      await copy.trigger('click', { shiftKey: true })
      await flushPromises()
      expect(clipboardWriteText).toHaveBeenCalledWith({ text: '[#9 Bug](#)' })
    })
  })
})
