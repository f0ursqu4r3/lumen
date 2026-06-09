import { describe, it, expect, vi } from 'vitest'
import { mount, RouterLinkStub, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'

vi.mock('@/features/dashboard/composables/useCurrentUser', () => ({
  useCurrentUser: () => ({ data: ref('ada') }),
}))
vi.mock('@/features/dashboard/composables/useAssignedIssues', () => ({
  useAssignedIssues: () => ({
    issues: ref([
      {
        iid: '42',
        title: 'Crash on save',
        state: 'opened',
        webPath: '/grp/proj/-/issues/42',
        webUrl: '#',
        updatedAt: new Date().toISOString(),
        labels: { nodes: [] },
      },
    ]),
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
})
