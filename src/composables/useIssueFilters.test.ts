import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h, nextTick } from 'vue'
import { createRouter, createMemoryHistory, type Router } from 'vue-router'
import { useIssueFilters } from './useIssueFilters'

function setup(initialQuery: Record<string, string | string[]> = {}, fullPath = 'grp/proj') {
  let api!: ReturnType<typeof useIssueFilters>
  const router: Router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/p/:fullPath(.*)', component: { render: () => null } }],
  })
  const Comp = defineComponent({
    setup() {
      api = useIssueFilters()
      return () => h('div')
    },
  })
  return {
    router,
    mountIt: async () => {
      await router.replace({ path: `/p/${fullPath}`, query: initialQuery })
      await router.isReady()
      mount(Comp, { global: { plugins: [router] } })
      await nextTick()
      return api
    },
  }
}

describe('useIssueFilters', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    localStorage.clear()
  })
  afterEach(() => vi.useRealTimers())

  it('hydrates labels/assignee/author/state from the query', async () => {
    const { mountIt } = setup({
      label: ['bug', 'ui'],
      assignee: 'ada',
      author: 'bob',
      state: 'closed',
    })
    const api = await mountIt()
    expect(api.labels.value).toEqual(['bug', 'ui'])
    expect(api.assignee.value).toBe('ada')
    expect(api.author.value).toBe('bob')
    expect(api.state.value).toBe('closed')
    expect(api.activeCount.value).toBe(4) // 2 labels + assignee + author
  })

  it('defaults state to opened and counts active label/assignee/author filters', async () => {
    const { mountIt } = setup()
    const api = await mountIt()
    expect(api.state.value).toBe('opened')
    expect(api.activeCount.value).toBe(0)
  })

  it('toggleLabel writes labels into the route query', async () => {
    const { router, mountIt } = setup()
    const api = await mountIt()
    api.toggleLabel('bug')
    await flushPromises()
    expect(router.currentRoute.value.query.label).toEqual('bug')
  })

  it('clearAll removes label/assignee/author but keeps unrelated query keys', async () => {
    const { router, mountIt } = setup({
      label: 'bug',
      assignee: 'ada',
      author: 'bob',
      issue: '9',
    })
    const api = await mountIt()
    api.clearAll()
    await flushPromises()
    const q = router.currentRoute.value.query
    expect(q.label).toBeUndefined()
    expect(q.assignee).toBeUndefined()
    expect(q.author).toBeUndefined()
    expect(q.issue).toBe('9')
  })

  it('debounces search into the query as `q`', async () => {
    const { router, mountIt } = setup()
    const api = await mountIt()
    api.search.value = 'crash'
    await nextTick()
    expect(router.currentRoute.value.query.q).toBeUndefined() // not yet
    vi.advanceTimersByTime(300)
    await flushPromises()
    expect(router.currentRoute.value.query.q).toBe('crash')
  })

  it('hydrates sort/group/view/scope from the query', async () => {
    const { mountIt } = setup({
      sort: 'priority',
      group: 'status',
      view: 'board',
      scope: 'team',
    })
    const api = await mountIt()
    expect(api.sort.value).toBe('priority')
    expect(api.group.value).toBe('status')
    expect(api.view.value).toBe('board')
    expect(api.scope.value).toBe('team')
  })

  it('defaults sort/group/view/scope when the keys are absent', async () => {
    const { mountIt } = setup()
    const api = await mountIt()
    expect(api.sort.value).toBe('updated')
    expect(api.group.value).toBe('none')
    expect(api.view.value).toBe('list')
    expect(api.scope.value).toBe('assigned')
  })

  it('writes non-default sort/group/view/scope and omits defaults', async () => {
    const { router, mountIt } = setup()
    const api = await mountIt()
    api.sort.value = 'title'
    api.view.value = 'board'
    api.group.value = 'status'
    api.scope.value = 'team'
    await flushPromises()
    expect(router.currentRoute.value.query.sort).toBe('title')
    expect(router.currentRoute.value.query.view).toBe('board')
    expect(router.currentRoute.value.query.group).toBe('status')
    expect(router.currentRoute.value.query.scope).toBe('team')
    api.sort.value = 'updated'
    api.view.value = 'list'
    api.group.value = 'none'
    api.scope.value = 'assigned'
    await flushPromises()
    expect(router.currentRoute.value.query.sort).toBeUndefined()
    expect(router.currentRoute.value.query.view).toBeUndefined()
    expect(router.currentRoute.value.query.group).toBeUndefined()
    expect(router.currentRoute.value.query.scope).toBeUndefined()
  })

  it('coalesces synchronous setter calls into one router.replace', async () => {
    const { router, mountIt } = setup()
    const api = await mountIt()
    const spy = vi.spyOn(router, 'replace')
    api.sort.value = 'priority'
    api.view.value = 'board'
    await flushPromises()
    expect(spy).toHaveBeenCalledTimes(1)
    expect(router.currentRoute.value.query.sort).toBe('priority')
    expect(router.currentRoute.value.query.view).toBe('board')
  })

  const keyFor = (p: string) => `lumen:issue-filters:${p}`

  it('persists the filter slice to localStorage per project', async () => {
    const { mountIt } = setup({}, 'grp/proj')
    const api = await mountIt()
    api.sort.value = 'title'
    api.assignee.value = 'ada'
    await flushPromises()
    const saved = JSON.parse(localStorage.getItem(keyFor('grp/proj'))!)
    expect(saved).toStrictEqual({ sort: 'title', assignee: 'ada' })
  })

  it('clears the storage entry when all keys return to default', async () => {
    const { mountIt } = setup({ sort: 'title' }, 'grp/proj')
    const api = await mountIt()
    expect(localStorage.getItem(keyFor('grp/proj'))).not.toBeNull()
    api.sort.value = 'updated'
    await flushPromises()
    expect(localStorage.getItem(keyFor('grp/proj'))).toBeNull()
  })

  it('seeds saved state into the query when no filter key is present', async () => {
    localStorage.setItem(
      'lumen:issue-filters:grp/proj',
      JSON.stringify({ sort: 'title', assignee: 'ada' }),
    )
    const { router, mountIt } = setup({}, 'grp/proj')
    const api = await mountIt()
    await flushPromises()
    expect(router.currentRoute.value.query.sort).toBe('title')
    expect(router.currentRoute.value.query.assignee).toBe('ada')
    expect(api.sort.value).toBe('title')
  })

  it('does NOT seed when the query already carries a filter key', async () => {
    localStorage.setItem('lumen:issue-filters:grp/proj', JSON.stringify({ sort: 'title' }))
    const { router, mountIt } = setup({ state: 'closed' }, 'grp/proj')
    await mountIt()
    await flushPromises()
    expect(router.currentRoute.value.query.sort).toBeUndefined()
  })

  it('seeds while preserving unrelated query keys like issue', async () => {
    localStorage.setItem('lumen:issue-filters:grp/proj', JSON.stringify({ sort: 'title' }))
    const { router, mountIt } = setup({ issue: '9' }, 'grp/proj')
    await mountIt()
    await flushPromises()
    expect(router.currentRoute.value.query.sort).toBe('title')
    expect(router.currentRoute.value.query.issue).toBe('9')
  })

  it('does not seed-navigate when no saved state exists', async () => {
    const { router, mountIt } = setup({ issue: '9' }, 'grp/proj')
    const api = await mountIt()
    const spy = vi.spyOn(router, 'replace')
    await flushPromises()
    void api
    expect(spy).not.toHaveBeenCalled()
    expect(router.currentRoute.value.query.issue).toBe('9')
  })

  it("restores the new project's saved state on project switch", async () => {
    localStorage.setItem('lumen:issue-filters:grp/proj-b', JSON.stringify({ sort: 'priority' }))
    const { router, mountIt } = setup({}, 'grp/proj-a')
    const api = await mountIt()
    await flushPromises()
    expect(api.sort.value).toBe('updated') // proj-a has no saved state
    await router.push('/p/grp/proj-b')
    await flushPromises()
    expect(router.currentRoute.value.query.sort).toBe('priority')
    expect(api.sort.value).toBe('priority')
    // proj-a storage not contaminated by proj-b's values
    expect(localStorage.getItem('lumen:issue-filters:grp/proj-a')).toBeNull()
  })
})
