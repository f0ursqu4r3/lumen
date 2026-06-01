import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, RouterLinkStub, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'

const useIssues = vi.fn()
vi.mock('@/composables/useIssues', () => ({ useIssues: () => useIssues() }))

import IssueList from './IssueList.vue'

const mountList = () =>
  mount(IssueList, {
    props: { fullPath: 'grp/proj' },
    global: { stubs: { RouterLink: RouterLinkStub } },
  })

const issue = {
  iid: '7',
  title: 'Crash',
  state: 'opened',
  webUrl: '#',
  labels: { nodes: [] },
  assignees: { nodes: [] },
}

beforeEach(() => {
  useIssues.mockReset()
})

describe('IssueList', () => {
  it('renders a row per issue', async () => {
    useIssues.mockReturnValue({
      data: ref({ nodes: [issue], pageInfo: { hasNextPage: false, endCursor: null } }),
      isLoading: ref(false),
      error: ref(null),
    })
    const w = mountList()
    await flushPromises()
    expect(w.text()).toContain('Crash')
  })

  it('shows a loading state', () => {
    useIssues.mockReturnValue({ data: ref(undefined), isLoading: ref(true), error: ref(null) })
    expect(mountList().text()).toContain('Loading')
  })

  it('shows the error via ErrorNotice', () => {
    useIssues.mockReturnValue({
      data: ref(undefined),
      isLoading: ref(false),
      error: ref({ kind: 'unknown', message: 'boom' }),
    })
    expect(mountList().text()).toContain('boom')
  })

  it('shows the empty state when there are no issues', () => {
    useIssues.mockReturnValue({
      data: ref({ nodes: [], pageInfo: { hasNextPage: false, endCursor: null } }),
      isLoading: ref(false),
      error: ref(null),
    })
    const w = mountList()
    expect(w.text()).toContain('No issues')
    expect(w.findComponent(RouterLinkStub).exists()).toBe(false)
  })
})
