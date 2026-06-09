import { describe, it, expect, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h, nextTick } from 'vue'
import { createRouter, createMemoryHistory } from 'vue-router'
import { useMrFilters } from './useMrFilters'

// Navigate + mount BEFORE reading `api`: the composable assigns `api` inside
// setup(), which only runs when the component mounts, and the URL must be
// applied first so the route-reading computeds see the initial query.
async function mountWith(initial: string): Promise<ReturnType<typeof useMrFilters>> {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/projects/:fullPath(.*)/merge-requests',
        name: 'merge-requests',
        component: { template: '<div/>' },
      },
    ],
  })
  let api!: ReturnType<typeof useMrFilters>
  const Comp = defineComponent({
    setup() {
      api = useMrFilters()
      return () => h('div')
    },
  })
  await router.push(initial)
  await router.isReady()
  mount(Comp, { global: { plugins: [router] } })
  await nextTick()
  return api
}

beforeEach(() => window.localStorage.clear())

describe('useMrFilters', () => {
  it('defaults to opened state, updated sort, any draft', async () => {
    const api = await mountWith('/projects/grp/proj/merge-requests')
    expect(api.state.value).toBe('opened')
    expect(api.sort.value).toBe('updated')
    expect(api.draft.value).toBe('any')
    expect(api.filters.value.state).toBe('opened')
  })

  it('reads reviewer/author/assignee/draft from the URL', async () => {
    const api = await mountWith(
      '/projects/grp/proj/merge-requests?reviewer=ray&author=ada&assignee=lin&draft=draft&state=merged',
    )
    expect(api.reviewer.value).toBe('ray')
    expect(api.author.value).toBe('ada')
    expect(api.assignee.value).toBe('lin')
    expect(api.draft.value).toBe('draft')
    expect(api.state.value).toBe('merged')
  })

  it('produces a viewSlice over the MR keys', async () => {
    const api = await mountWith('/projects/grp/proj/merge-requests?reviewer=ray&sort=created')
    expect(api.viewSlice.value).toMatchObject({ reviewer: 'ray', sort: 'created' })
  })

  it('clearAll drops the filter chips but keeps state/sort/draft', async () => {
    const api = await mountWith(
      '/projects/grp/proj/merge-requests?reviewer=ray&author=ada&state=merged&sort=created&draft=draft',
    )
    api.clearAll()
    await flushPromises()
    expect(api.reviewer.value).toBe('')
    expect(api.author.value).toBe('')
    expect(api.state.value).toBe('merged')
    expect(api.sort.value).toBe('created')
    expect(api.draft.value).toBe('draft')
  })

  it('seeds the URL from per-project storage on arrival when the URL is bare', async () => {
    window.localStorage.setItem(
      'lumen:mr-filters:grp/proj',
      JSON.stringify({ reviewer: 'ray', state: 'merged' }),
    )
    const api = await mountWith('/projects/grp/proj/merge-requests')
    await flushPromises()
    expect(api.reviewer.value).toBe('ray')
    expect(api.state.value).toBe('merged')
  })
})
