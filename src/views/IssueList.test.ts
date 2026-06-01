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

// Mirrors the useIssues (useInfiniteQuery-backed) return contract.
const mockQuery = (over: Record<string, unknown> = {}) =>
  useIssues.mockReturnValue({
    issues: ref([]),
    isLoading: ref(false),
    error: ref(null),
    hasNextPage: ref(false),
    isFetchingNextPage: ref(false),
    fetchNextPage: vi.fn(),
    ...over,
  })

beforeEach(() => {
  useIssues.mockReset()
  createMutate.mockReset()
})

describe('IssueList', () => {
  it('renders a row per issue', async () => {
    mockQuery({ issues: ref([issue]) })
    const w = mountList()
    await flushPromises()
    expect(w.text()).toContain('Crash')
  })

  it('shows a loading state', () => {
    mockQuery({ isLoading: ref(true) })
    expect(mountList().find('[data-slot="skeleton"]').exists()).toBe(true)
  })

  it('shows the error via ErrorNotice', () => {
    mockQuery({ error: ref({ kind: 'unknown', message: 'boom' }) })
    expect(mountList().text()).toContain('boom')
  })

  it('shows the empty state when there are no issues', () => {
    mockQuery({ issues: ref([]) })
    const w = mountList()
    expect(w.text()).toContain('No issues')
    expect(w.findComponent(RouterLinkStub).exists()).toBe(false)
  })

  it('creates an issue from the new-issue form', async () => {
    mockQuery({ issues: ref([]) })
    const w = mountList()
    await w.find('input[placeholder="New issue title…"]').setValue('Brand new')
    await w.find('form').trigger('submit.prevent')
    expect(createMutate).toHaveBeenCalledWith({ title: 'Brand new' }, expect.anything())
  })
})
