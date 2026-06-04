import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'

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
vi.mock('vue-router', () => ({ onBeforeRouteLeave: vi.fn() }))

const { openExternal } = vi.hoisted(() => ({
  openExternal: vi.fn(() => Promise.resolve({ ok: true })),
}))
vi.mock('@/lib/rpc', () => ({ rpc: { openExternal } }))

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
  notes: {
    nodes: [
      {
        id: 'n1',
        body: 'me too',
        system: false,
        createdAt: '2026-01-01T00:00:00Z',
        author: { username: 'a', avatarUrl: null },
      },
      {
        id: 'n2',
        body: 'changed milestone',
        system: true,
        createdAt: '2026-01-01T00:00:00Z',
        author: { username: 'bot', avatarUrl: null },
      },
    ],
  },
}

const mountDetail = () => mount(IssueDetail, { props: { fullPath: 'grp/proj', iid: '9' } })

beforeEach(() => {
  useIssue.mockReset()
  draftSave.mockReset()
  draftReset.mockReset()
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

    const liFor = (body: string) => w.findAll('li').find((li) => li.text().includes(body))
    // The note present at load lands with the section, not its own entrance.
    expect(liFor('me too')?.classes()).not.toContain('animate-note-in')

    // A poll delivers a new comment.
    issueRef.value = {
      ...issueRef.value,
      notes: {
        nodes: [
          ...issueRef.value.notes.nodes,
          {
            id: 'n3',
            body: 'fresh reply',
            system: false,
            createdAt: '2026-01-02T00:00:00Z',
            author: { username: 'b', avatarUrl: null },
          },
        ],
      },
    }
    await flushPromises()

    // Only the newcomer animates; the pre-existing note stays put.
    expect(liFor('fresh reply')?.classes()).toContain('animate-note-in')
    expect(liFor('me too')?.classes()).not.toContain('animate-note-in')
  })

  describe('the GitLab link', () => {
    const writeText = vi.fn(() => Promise.resolve())
    beforeEach(() => {
      writeText.mockClear()
      openExternal.mockClear()
      vi.stubGlobal('navigator', { clipboard: { writeText } })
    })

    it('opens externally via the host on a plain click (no copy)', async () => {
      // The native webview ignores <a target="_blank">; a plain click must route
      // through the Bun process (Utils.openExternal) to reach the system browser.
      const w = mountDetail()
      await flushPromises()
      const link = w.get('[data-testid="open-in-gitlab"]')
      await link.trigger('click')
      await flushPromises()
      expect(openExternal).toHaveBeenCalledWith({ url: '#' })
      expect(writeText).not.toHaveBeenCalled()
      expect(link.text()).toContain('Open in GitLab')
    })

    it('copies the URL on Shift+Click and confirms', async () => {
      const w = mountDetail()
      await flushPromises()
      const link = w.get('[data-testid="open-in-gitlab"]')
      await link.trigger('click', { shiftKey: true })
      await flushPromises()
      expect(writeText).toHaveBeenCalledWith('#')
      expect(link.text()).toContain('Copied URL')
    })

    it('copies a markdown link on Shift+Meta+Click', async () => {
      const w = mountDetail()
      await flushPromises()
      const link = w.get('[data-testid="open-in-gitlab"]')
      await link.trigger('click', { shiftKey: true, metaKey: true })
      await flushPromises()
      expect(writeText).toHaveBeenCalledWith('[#9 Bug](#)')
      expect(link.text()).toContain('Copied markdown')
    })
  })
})
