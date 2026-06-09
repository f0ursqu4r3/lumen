import { afterEach, describe, it, expect, vi } from 'vitest'
import { mount, RouterLinkStub, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'

// Hoisted, mutable so individual tests can simulate the cold-start (username
// still resolving, issues query disabled) path.
const { userPending, issues } = vi.hoisted(() => ({
  userPending: { value: false },
  issues: {
    value: [
      {
        iid: '42',
        title: 'Crash on save',
        state: 'opened',
        webPath: '/grp/proj/-/issues/42',
        webUrl: '#',
        updatedAt: new Date().toISOString(),
        labels: { nodes: [] },
      },
    ] as Array<Record<string, unknown>>,
  },
}))

vi.mock('@/features/dashboard/composables/useCurrentUser', () => ({
  useCurrentUser: () => ({ data: ref('ada'), isPending: ref(userPending.value) }),
}))
vi.mock('@/features/dashboard/composables/useAssignedIssues', () => ({
  useAssignedIssues: () => ({
    issues: ref(issues.value),
    isLoading: ref(false),
    error: ref(null),
    hasMore: ref(false),
  }),
}))
vi.mock('@/features/dashboard/composables/useAssignedMergeRequests', () => ({
  useAssignedMergeRequests: () => ({
    mrs: ref([]),
    isLoading: ref(false),
    error: ref(null),
    hasMore: ref(false),
  }),
}))
vi.mock('@/features/dashboard/composables/useReviewRequestedMergeRequests', () => ({
  useReviewRequestedMergeRequests: () => ({
    mrs: ref([
      {
        iid: '5',
        title: 'Add API',
        state: 'opened',
        draft: false,
        webUrl: '#',
        updatedAt: new Date().toISOString(),
        project: { fullPath: 'grp/proj' },
        approved: false,
        approvalsRequired: 1,
        reviewers: { nodes: [] },
      },
    ]),
    isLoading: ref(false),
    error: ref(null),
    hasMore: ref(false),
  }),
}))

import MyWork from './MyWork.vue'

afterEach(() => {
  userPending.value = false
  issues.value = [
    {
      iid: '42',
      title: 'Crash on save',
      state: 'opened',
      webPath: '/grp/proj/-/issues/42',
      webUrl: '#',
      updatedAt: new Date().toISOString(),
      labels: { nodes: [] },
    },
  ]
})

describe('MyWork', () => {
  it('renders the three lanes with their items', async () => {
    const w = mount(MyWork, { global: { stubs: { RouterLink: RouterLinkStub } } })
    await flushPromises()
    expect(w.text()).toContain('Assigned Issues')
    expect(w.text()).toContain('Assigned MRs')
    expect(w.text()).toContain('Awaiting My Review')
    expect(w.text()).toContain('Crash on save')
    expect(w.text()).toContain('Add API')
    expect(w.text()).toContain('No MRs assigned')
  })

  it('shows the issues skeleton (not the empty message) while the username resolves', async () => {
    userPending.value = true
    issues.value = []
    const w = mount(MyWork, { global: { stubs: { RouterLink: RouterLinkStub } } })
    await flushPromises()
    expect(w.find('[data-testid="lane-skeleton"]').exists()).toBe(true)
    expect(w.text()).not.toContain('Nothing assigned to you.')
  })
})
