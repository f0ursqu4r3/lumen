import { describe, it, expect, vi } from 'vitest'
import { mount, RouterLinkStub, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import { VueQueryPlugin, QueryClient } from '@tanstack/vue-query'

vi.mock('@/features/merge_requests/composables/useMergeRequest', () => ({
  useMergeRequest: () => ({
    data: ref({
      id: 'gid://MR/1',
      iid: '5',
      title: 'Add API',
      state: 'opened',
      draft: false,
      descriptionHtml: '<p>Adds the API</p>',
      sourceBranch: 'feat',
      targetBranch: 'main',
      approved: false,
      approvalsRequired: 1,
      conflicts: false,
      mergeableDiscussionsState: true,
      webUrl: 'https://gl/mr/5',
      createdAt: 't',
      updatedAt: 't',
      author: { name: 'Ada', username: 'ada' },
      assignees: { nodes: [] },
      reviewers: { nodes: [] },
      labels: { nodes: [] },
      milestone: null,
      headPipeline: null,
      discussions: {
        nodes: [
          {
            id: 'd1',
            notes: {
              nodes: [
                {
                  id: 'n1',
                  body: 'nice',
                  system: false,
                  createdAt: 't',
                  author: { name: 'Ada', username: 'ada' },
                },
              ],
            },
          },
        ],
      },
    }),
    isLoading: ref(false),
    error: ref(null),
  }),
}))

import MergeRequestDetail from './MergeRequestDetail.vue'

describe('MergeRequestDetail', () => {
  it('renders the MR title, description and a thread', async () => {
    const w = mount(MergeRequestDetail, {
      props: { fullPath: 'grp/proj', iid: '5' },
      global: {
        // MrDiscussion's reply mutation calls useQueryClient, so the real
        // component needs VueQueryPlugin in context.
        plugins: [[VueQueryPlugin, { queryClient: new QueryClient() }]],
        stubs: { RouterLink: RouterLinkStub, PipelineStatusBadge: true, teleport: true },
      },
    })
    await flushPromises()
    expect(w.text()).toContain('Add API')
    expect(w.text()).toContain('Adds the API')
    expect(w.text()).toContain('nice')
  })

  it('renders inside the shell: no in-view back-link, action teleported', async () => {
    const w = mount(MergeRequestDetail, {
      props: { fullPath: 'grp/proj', iid: '5' },
      global: {
        plugins: [[VueQueryPlugin, { queryClient: new QueryClient() }]],
        stubs: { RouterLink: RouterLinkStub, PipelineStatusBadge: true, teleport: true },
      },
    })
    await flushPromises()
    // The old in-view "Merge requests" back RouterLink is gone (shell provides it).
    const backLinks = w
      .findAllComponents(RouterLinkStub)
      .filter((l) => (l.props('to') as { name?: string }).name === 'merge-requests')
    expect(backLinks).toHaveLength(0)
    // "Open in GitLab" still rendered (teleport stubbed inline).
    expect(w.text()).toContain('Open in GitLab')
  })
})
