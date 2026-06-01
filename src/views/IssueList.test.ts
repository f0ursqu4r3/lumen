import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, RouterLinkStub, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'

const useIssues = vi.fn()
vi.mock('@/composables/useIssues', () => ({ useIssues: () => useIssues() }))

const { createMutate } = vi.hoisted(() => ({ createMutate: vi.fn() }))
vi.mock('@/composables/useIssueMutations', () => ({
  useCreateIssue: () => ({ mutate: createMutate, isPending: { value: false }, error: { value: null } }),
}))

import IssueList from './IssueList.vue'

const mountList = () =>
  mount(IssueList, {
    props: { fullPath: 'grp/proj' },
    global: { stubs: { RouterLink: RouterLinkStub } },
  })

const issue = {
  iid: '7', title: 'Crash', state: 'opened', webUrl: '#',
  labels: { nodes: [] }, assignees: { nodes: [] },
}

beforeEach(() => {
  useIssues.mockReset()
  createMutate.mockReset()
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
    expect(mountList().find('[data-slot="skeleton"]').exists()).toBe(true)
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

  it('creates an issue from the new-issue form', async () => {
    useIssues.mockReturnValue({
      data: ref({ nodes: [], pageInfo: { hasNextPage: false, endCursor: null } }),
      isLoading: ref(false),
      error: ref(null),
    })
    const w = mountList()
    await w.find('input[placeholder="New issue title…"]').setValue('Brand new')
    await w.find('form').trigger('submit.prevent')
    expect(createMutate).toHaveBeenCalledWith({ title: 'Brand new' }, expect.anything())
  })
})
