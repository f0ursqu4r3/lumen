import { afterEach, describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, ref } from 'vue'

// A mutable hits ref so individual tests can simulate a search returning
// results or nothing (e.g. the error/empty path that collapses to []).
const { hits, mrHits } = vi.hoisted(() => ({
  hits: {
    value: [{ iid: '3', title: 'Fix login', state: 'opened' }] as Array<Record<string, unknown>>,
  },
  mrHits: {
    value: [{ iid: '9', title: 'Refactor', state: 'opened', draft: false }] as Array<
      Record<string, unknown>
    >,
  },
}))

// Stub the data sources so we test merge/order, not data fetching.
vi.mock('@/features/projects/composables/useProjectBrowser', () => ({
  useProjectBrowser: () => ({
    flatRows: ref([{ name: 'Proj', fullPath: 'grp/proj' }]),
  }),
}))
vi.mock('@/shared/composables/useSavedViews', () => ({
  useSavedViews: () => ({
    views: ref([{ id: 'v1', name: 'My open bugs', query: { label: 'bug' } }]),
  }),
}))
vi.mock('./usePaletteIssueSearch', () => ({
  usePaletteIssueSearch: () => ({ hits: ref(hits.value), isFetching: ref(false) }),
}))
vi.mock('./usePaletteMrSearch', () => ({
  usePaletteMrSearch: () => ({ hits: ref(mrHits.value), isFetching: ref(false) }),
}))

afterEach(() => {
  hits.value = [{ iid: '3', title: 'Fix login', state: 'opened' }]
  mrHits.value = [{ iid: '9', title: 'Refactor', state: 'opened', draft: false }]
})

const route = { params: { fullPath: 'grp/proj' }, query: {} }
vi.mock('vue-router', () => ({
  useRoute: () => route,
  useRouter: () => ({ push: vi.fn() }),
}))

import { usePaletteCommands } from './usePaletteCommands'

// Mount inside a component so composable lifecycle hooks run.
function run(query = ref('')) {
  let api!: ReturnType<typeof usePaletteCommands>
  const Comp = defineComponent({
    setup() {
      api = usePaletteCommands(query)
      return () => h('div')
    },
  })
  mount(Comp)
  return api
}

describe('usePaletteCommands', () => {
  // "open" matches several Actions ("Open …") and the "My open bugs" view, so
  // every group is non-empty: Actions + Views by name filter, Projects from the
  // (mocked) browser, Issues from the (mocked) search hits.
  it('orders non-empty groups Actions, Projects, Issues, Merge Requests, Views', () => {
    const { groups } = run(ref('open'))
    expect(groups.value.map((g) => g.group)).toEqual([
      'Actions',
      'Projects',
      'Issues',
      'Merge Requests',
      'Views',
    ])
  })

  it('flat list concatenates group items in group order', () => {
    const { groups, flat } = run(ref('open'))
    const expected = groups.value.flatMap((g) => g.items.map((i) => i.id))
    expect(flat.value.map((c) => c.id)).toEqual(expected)
  })

  it('filters Actions and Views by the query', () => {
    const { groups } = run(ref('settings'))
    const actions = groups.value.find((g) => g.group === 'Actions')!
    expect(actions.items.map((c) => c.id)).toEqual(['settings'])
    // "settings" matches no saved-view name, so the Views group drops out.
    expect(groups.value.some((g) => g.group === 'Views')).toBe(false)
  })

  it('drops empty groups entirely', () => {
    const { groups } = run(ref('zzz-no-match'))
    // Issues survive a no-match query (search hits are not name-filtered here).
    const issues = groups.value.find((g) => g.group === 'Issues')
    expect(issues?.items.map((c) => c.id)).toEqual(['issue-3'])
    // Actions filtered to none for this query -> group omitted.
    expect(groups.value.some((g) => g.group === 'Actions')).toBe(false)
  })

  it('drops the Issues group but keeps the rest when search yields no hits', () => {
    // Simulates the resilient path: a failed/empty search collapses to [].
    hits.value = []
    mrHits.value = []
    const { groups } = run(ref('open'))
    expect(groups.value.some((g) => g.group === 'Issues')).toBe(false)
    expect(groups.value.some((g) => g.group === 'Merge Requests')).toBe(false)
    expect(groups.value.map((g) => g.group)).toEqual(['Actions', 'Projects', 'Views'])
  })
})
