import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, RouterLinkStub, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import { createRouter, createMemoryHistory } from 'vue-router'
import IssueDrawer from '@/components/IssueDrawer.vue'
import IssueComposer from '@/components/IssueComposer.vue'
import IssueRow from '@/components/IssueRow.vue'

const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/', name: 'issues', component: { template: '<div />' } },
    {
      path: '/projects/:fullPath(.*)/issues/:iid',
      name: 'issue',
      component: { template: '<div />' },
    },
  ],
})

const useIssues = vi.fn()
vi.mock('@/composables/useIssues', () => ({ useIssues: () => useIssues() }))

const pipelinesRef = ref<Array<{ status: string }>>([])
vi.mock('@/composables/usePipelines', () => ({
  usePipelines: () => ({ pipelines: pipelinesRef }),
}))

const { createMutate } = vi.hoisted(() => ({ createMutate: vi.fn() }))
const { confirmMock } = vi.hoisted(() => ({ confirmMock: vi.fn() }))
vi.mock('@/composables/useConfirm', () => ({
  useConfirm: () => ({ confirm: confirmMock }),
}))
vi.mock('@/composables/useIssueMutations', () => ({
  useCreateIssue: () => ({
    mutate: createMutate,
    isPending: { value: false },
    error: { value: null },
  }),
  useRetagIssue: () => ({ mutate: vi.fn() }),
  useReassignIssue: () => ({ mutate: vi.fn() }),
}))
vi.mock('@/composables/useWorkItemStatus', () => ({
  useWorkItemStatuses: () => ({ data: ref([]) }),
  useSetIssueStatus: () => ({ mutate: vi.fn() }),
}))
vi.mock('@/composables/useProjectLabels', () => ({
  useProjectLabels: () => ({ data: ref([]) }),
}))
vi.mock('@/composables/useProjectMembers', () => ({
  useProjectMembers: () => ({ data: ref([]) }),
}))

const openIssueWindow = vi.fn().mockResolvedValue({ ok: true })
vi.mock('@/lib/rpc', () => ({
  rpc: { openIssueWindow: (a: { fullPath: string; iid: string }) => openIssueWindow(a) },
}))

import IssueList from './IssueList.vue'

const mountList = () =>
  mount(IssueList, {
    props: { fullPath: 'grp/proj' },
    global: {
      plugins: [router],
      stubs: { RouterLink: RouterLinkStub, IssueDrawer: true, IssueComposer: true },
    },
  })

const issue = {
  iid: '7',
  title: 'Crash',
  state: 'opened',
  webUrl: '#',
  labels: { nodes: [] },
  assignees: { nodes: [] },
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
    refetch: vi.fn().mockResolvedValue(undefined),
    ...over,
  })

beforeEach(() => {
  localStorage.clear()
  useIssues.mockReset()
  createMutate.mockReset()
  confirmMock.mockReset()
  pipelinesRef.value = []
  openIssueWindow.mockClear()
})

afterEach(async () => {
  await router.replace('/')
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
    // No issue rows render in the empty state — the only links are the header
    // affordances: back-to-projects on the title and the Pipelines nav link.
    const testids = w.findAllComponents(RouterLinkStub).map((l) => l.attributes('data-testid'))
    expect(testids).toEqual(['back-to-projects', 'view-pipelines'])
  })

  it('flags in-flight pipelines on the Pipelines button', async () => {
    mockQuery({ issues: ref([]) })
    // Every non-terminal status counts; the terminal ones (SUCCESS/FAILED/
    // CANCELED/SKIPPED) do not.
    pipelinesRef.value = [
      { status: 'RUNNING' },
      { status: 'PENDING' },
      { status: 'MANUAL' },
      { status: 'SUCCESS' },
      { status: 'FAILED' },
    ]
    const w = mountList()
    await flushPromises()
    const tell = w.find('[data-testid="pipelines-running"]')
    expect(tell.exists()).toBe(true)
    expect(tell.text()).toBe('3')
    expect(tell.attributes('title')).toBe('3 active')
  })

  it('hides the running tell when every pipeline has finished', async () => {
    mockQuery({ issues: ref([]) })
    pipelinesRef.value = [{ status: 'SUCCESS' }, { status: 'FAILED' }, { status: 'SKIPPED' }]
    const w = mountList()
    await flushPromises()
    expect(w.find('[data-testid="pipelines-running"]').exists()).toBe(false)
  })

  it('has no persistent quick-create bar', () => {
    mockQuery({ issues: ref([]) })
    const w = mountList()
    expect(w.find('input[placeholder="New issue title…"]').exists()).toBe(false)
  })

  it('opens the composer from the header New issue button', async () => {
    mockQuery({ issues: ref([issue]) })
    const w = mountList()
    await w.get('[data-testid="new-issue"]').trigger('click')
    expect(w.findComponent(IssueComposer).props('open')).toBe(true)
  })

  it('refetches the loaded pages when the refresh button is clicked', async () => {
    const refetch = vi.fn().mockResolvedValue(undefined)
    mockQuery({ issues: ref([issue]), refetch })
    const w = mountList()
    await w.get('[data-testid="refresh-issues"]').trigger('click')
    await flushPromises()
    expect(refetch).toHaveBeenCalledOnce()
  })

  it('opens the composer from the empty-state Create issue button', async () => {
    mockQuery({ issues: ref([]) })
    const w = mountList()
    await w.get('[data-testid="empty-new-issue"]').trigger('click')
    expect(w.findComponent(IssueComposer).props('open')).toBe(true)
  })

  it('opens the composer when the C key is pressed', async () => {
    mockQuery({ issues: ref([issue]) })
    const w = mountList()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'c' }))
    await flushPromises()
    expect(w.findComponent(IssueComposer).props('open')).toBe(true)
  })

  it('does not open the composer on C while the drawer is open', async () => {
    mockQuery({ issues: ref([issue]) })
    await router.replace('/?issue=7')
    await router.isReady()
    const w = mountList()
    await flushPromises()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'c' }))
    await flushPromises()
    expect(w.findComponent(IssueComposer).props('open')).toBe(false)
  })

  it('opens the composer on C even with Caps Lock (uppercase key)', async () => {
    mockQuery({ issues: ref([issue]) })
    const w = mountList()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'C' }))
    await flushPromises()
    expect(w.findComponent(IssueComposer).props('open')).toBe(true)
  })

  it('does not reopen on C while the composer is already open', async () => {
    mockQuery({ issues: ref([issue]) })
    const w = mountList()
    await w.get('[data-testid="new-issue"]').trigger('click')
    expect(w.findComponent(IssueComposer).props('open')).toBe(true)
    // Closing is driven by update:open; a second C press must not interfere.
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'c' }))
    await flushPromises()
    expect(w.findComponent(IssueComposer).props('open')).toBe(true)
  })

  it('highlights the newly created issue when the composer emits created', async () => {
    mockQuery({ issues: ref([issue]) })
    const w = mountList()
    await flushPromises()
    w.findComponent(IssueComposer).vm.$emit('created', '7')
    await flushPromises()
    expect(w.findComponent(IssueRow).props('highlight')).toBe(true)
  })

  it('opens the drawer when ?issue is present', async () => {
    mockQuery({ issues: ref([issue]) })
    await router.replace('/?issue=7')
    await router.isReady()
    const w = mountList()
    await flushPromises()
    const drawer = w.findComponent(IssueDrawer)
    expect(drawer.props('open')).toBe(true)
    expect(drawer.props('iid')).toBe('7')
  })

  it('opens a native issue window and closes the drawer when expand is emitted', async () => {
    mockQuery({ issues: ref([issue]) })
    await router.replace('/?issue=7')
    await router.isReady()
    const w = mountList()
    await flushPromises()
    w.findComponent(IssueDrawer).vm.$emit('expand')
    await flushPromises()
    expect(openIssueWindow).toHaveBeenCalledWith({ fullPath: 'grp/proj', iid: '7' })
    expect(router.currentRoute.value.query.issue).toBeUndefined()
    expect(router.currentRoute.value.name).toBe('issues')
  })

  it('removes ?issue from the URL when the drawer emits update:open false', async () => {
    mockQuery({ issues: ref([issue]) })
    await router.replace('/?issue=7')
    await router.isReady()
    const w = mountList()
    await flushPromises()
    w.findComponent(IssueDrawer).vm.$emit('update:open', false)
    await flushPromises()
    expect(router.currentRoute.value.query.issue).toBeUndefined()
  })
})

describe('IssueList — drawer dirty-guard', () => {
  const DrawerStub = {
    name: 'IssueDrawer',
    emits: ['update:open', 'update:dirty', 'expand'],
    template: `<div>
      <button data-testid="stub-dirty" @click="$emit('update:dirty', true)" />
      <button data-testid="stub-close" @click="$emit('update:open', false)" />
      <button data-testid="stub-expand" @click="$emit('expand')" />
    </div>`,
  }

  const mountDirtyGuard = async (query = '/?issue=9') => {
    mockQuery({ issues: ref([]) })
    await router.replace(query)
    await router.isReady()
    const w = mount(IssueList, {
      props: { fullPath: 'grp/proj' },
      global: {
        plugins: [router],
        stubs: { RouterLink: RouterLinkStub, IssueDrawer: DrawerStub, IssueComposer: true },
      },
    })
    await flushPromises()
    return w
  }

  it('keeps the drawer open when discarding is cancelled', async () => {
    const w = await mountDirtyGuard('/?issue=9')
    await w.get('[data-testid="stub-dirty"]').trigger('click')
    confirmMock.mockResolvedValue(false)
    await w.get('[data-testid="stub-close"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query.issue).toBe('9')
    expect(confirmMock).toHaveBeenCalledOnce()
  })

  it('closes the drawer when discard is confirmed', async () => {
    const w = await mountDirtyGuard('/?issue=9')
    await w.get('[data-testid="stub-dirty"]').trigger('click')
    confirmMock.mockResolvedValue(true)
    await w.get('[data-testid="stub-close"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query.issue).toBeUndefined()
  })

  it('does not confirm when closing a clean drawer', async () => {
    confirmMock.mockResolvedValue(true)
    const w = await mountDirtyGuard('/?issue=9')
    await w.get('[data-testid="stub-close"]').trigger('click')
    await flushPromises()
    expect(confirmMock).not.toHaveBeenCalled()
    expect(router.currentRoute.value.query.issue).toBeUndefined()
  })

  it('guards expand when dirty — does not open a window when discard is cancelled', async () => {
    const w = await mountDirtyGuard('/?issue=9')
    await w.get('[data-testid="stub-dirty"]').trigger('click')
    confirmMock.mockResolvedValue(false)
    await w.get('[data-testid="stub-expand"]').trigger('click')
    await flushPromises()
    expect(openIssueWindow).not.toHaveBeenCalled()
    expect(router.currentRoute.value.query.issue).toBe('9')
    expect(confirmMock).toHaveBeenCalledOnce()
  })

  it('guards expand when dirty — opens the window and closes the drawer when confirmed', async () => {
    const w = await mountDirtyGuard('/?issue=9')
    await w.get('[data-testid="stub-dirty"]').trigger('click')
    confirmMock.mockResolvedValue(true)
    await w.get('[data-testid="stub-expand"]').trigger('click')
    await flushPromises()
    expect(openIssueWindow).toHaveBeenCalledWith({ fullPath: 'grp/proj', iid: '9' })
    expect(router.currentRoute.value.query.issue).toBeUndefined()
  })
})
