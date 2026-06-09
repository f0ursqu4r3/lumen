import { describe, it, expect, vi } from 'vitest'
import { mount, RouterLinkStub, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'

vi.mock('@/features/merge_requests/composables/useMrFilters', () => ({
  useMrFilters: () => ({
    state: ref('opened'),
    labels: ref([]),
    author: ref(''),
    assignee: ref(''),
    reviewer: ref(''),
    milestone: ref(''),
    draft: ref('any'),
    sort: ref('updated'),
    search: ref(''),
    activeCount: ref(0),
    toggleLabel: () => {},
    clearAll: () => {},
    filters: ref({ state: 'opened', labels: [], draft: 'any', sort: 'updated' }),
    viewSlice: ref({}),
    applyView: () => {},
  }),
}))
vi.mock('@/features/merge_requests/composables/useMergeRequests', () => ({
  useMergeRequests: () => ({
    mergeRequests: ref([
      {
        iid: '5',
        title: 'Add API',
        state: 'opened',
        draft: false,
        conflicts: false,
        webUrl: '#',
        createdAt: 't',
        updatedAt: 't',
        mergedAt: null,
        sourceBranch: 'feat',
        targetBranch: 'main',
        approved: false,
        approvalsRequired: null,
        author: { name: 'Ada', username: 'ada' },
        assignees: { nodes: [] },
        reviewers: { nodes: [] },
        labels: { nodes: [] },
        milestone: null,
        headPipeline: null,
      },
    ]),
    isLoading: ref(false),
    isFetching: ref(false),
    error: ref(null),
    hasNextPage: ref(false),
    fetchNextPage: () => {},
    isFetchingNextPage: ref(false),
  }),
}))
vi.mock('@/features/merge_requests/composables/useMrSavedViews', () => ({
  useMrSavedViews: () => ({
    savedViews: { views: ref([]), rename: () => {} },
    activeViewId: ref(null),
    canSaveView: ref(false),
    loadedViewId: ref(null),
    loadView: () => {},
    saveCurrentView: () => {},
    updateView: () => {},
    removeView: () => {},
  }),
}))

import MergeRequestList from './MergeRequestList.vue'

describe('MergeRequestList', () => {
  it('renders MR rows for the project', async () => {
    const w = mount(MergeRequestList, {
      props: { fullPath: 'grp/proj' },
      global: { stubs: { RouterLink: RouterLinkStub } },
    })
    await flushPromises()
    expect(w.text()).toContain('Add API')
    expect(w.text()).toContain('feat')
  })

  it('no longer renders the in-view MR list header', async () => {
    const w = mount(MergeRequestList, {
      props: { fullPath: 'grp/proj' },
      global: { stubs: { RouterLink: RouterLinkStub } },
    })
    await flushPromises()
    // The MergeRequestListHeader rendered an <h1> with the repo name; it should be gone.
    expect(w.find('h1').exists()).toBe(false)
  })
})
