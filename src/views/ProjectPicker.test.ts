import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, RouterLinkStub } from '@vue/test-utils'
import { computed, ref, type Ref } from 'vue'

const useProjects = vi.fn()
vi.mock('@/composables/useProjects', () => ({
  useProjects: () => useProjects(),
}))

// The picker drives navigation itself (for the View Transition morph), so it
// needs a router; RouterLink is stubbed separately below.
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))

import ProjectPicker from './ProjectPicker.vue'

type Project = { id: string; fullPath: string; name: string }

// Mirror the composable's public shape: a flattened `projects` plus the
// infinite-query controls the picker reads.
const mockProjects = (
  opts: {
    projects?: Project[]
    isLoading?: boolean
    error?: unknown
    hasNextPage?: boolean
  } = {},
) =>
  useProjects.mockReturnValue({
    projects: computed(() => opts.projects ?? []) as Ref<Project[]>,
    isLoading: ref(opts.isLoading ?? false),
    error: ref(opts.error ?? null),
    hasNextPage: ref(opts.hasNextPage ?? false),
    isFetchingNextPage: ref(false),
    fetchNextPage: vi.fn(),
  })

const mountPicker = () =>
  mount(ProjectPicker, { global: { stubs: { RouterLink: RouterLinkStub } } })

beforeEach(() => {
  useProjects.mockReset()
})

describe('ProjectPicker', () => {
  it('renders a link to each project issue list', () => {
    mockProjects({
      projects: [{ id: 'gid://1', fullPath: 'grp/proj', name: 'Proj' }],
    })
    const w = mountPicker()
    const link = w.findComponent(RouterLinkStub)
    expect(link.text()).toContain('Proj')
    expect(link.props('to')).toEqual({
      name: 'issues',
      params: { fullPath: 'grp/proj' },
    })
  })

  it('shows a loading state', () => {
    mockProjects({ isLoading: true })
    expect(mountPicker().find('[data-slot="skeleton"]').exists()).toBe(true)
  })

  it('shows the error via ErrorNotice', () => {
    mockProjects({ error: { kind: 'unknown', message: 'boom' } })
    expect(mountPicker().text()).toContain('boom')
  })

  it('shows the empty state when there are no projects', () => {
    mockProjects({ projects: [] })
    const w = mountPicker()
    expect(w.text()).toContain('No projects')
    expect(w.findComponent(RouterLinkStub).exists()).toBe(false)
  })
})
