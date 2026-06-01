import { describe, it, expect, vi } from 'vitest'
import { mount, RouterLinkStub, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'

vi.mock('@/composables/useIssues', () => ({
  useIssues: () => ({
    data: ref({ nodes: [{ iid: '7', title: 'Crash', state: 'opened', webUrl: '#', labels: { nodes: [] }, assignees: { nodes: [] } }], pageInfo: { hasNextPage: false, endCursor: null } }),
    isLoading: ref(false),
    error: ref(null),
  }),
}))

import IssueList from './IssueList.vue'

describe('IssueList', () => {
  it('renders a row per issue', async () => {
    const w = mount(IssueList, {
      props: { fullPath: 'grp/proj' },
      global: { stubs: { RouterLink: RouterLinkStub } },
    })
    await flushPromises()
    expect(w.text()).toContain('Crash')
  })
})
