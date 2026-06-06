import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, RouterLinkStub } from '@vue/test-utils'
import { computed, ref, type Ref } from 'vue'

const useProjects = vi.fn()
vi.mock('@/features/projects/composables/useProjects', () => ({
  useProjects: () => useProjects(),
}))

// The Starred / Assigned sources are mocked so the picker mounts without a Vue
// Query provider; useProjectBrowser itself stays real, so its section + dedup
// logic is exercised through the component.
const useStarredProjects = vi.fn()
vi.mock('@/features/projects/composables/useStarredProjects', () => ({
  useStarredProjects: () => useStarredProjects(),
}))
const useAssignedProjects = vi.fn()
vi.mock('@/features/projects/composables/useAssignedProjects', () => ({
  useAssignedProjects: () => useAssignedProjects(),
}))

const { toggleMutate } = vi.hoisted(() => ({ toggleMutate: vi.fn() }))
vi.mock('@/features/projects/composables/useToggleStar', () => ({
  useToggleStar: () => ({ mutate: toggleMutate }),
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

const mockStarred = (rows: { name: string; fullPath: string }[] = []) =>
  useStarredProjects.mockReturnValue({ starred: computed(() => rows) })
const mockAssigned = (rows: { name: string; fullPath: string; assignedOpen: number }[] = []) =>
  useAssignedProjects.mockReturnValue({ assigned: computed(() => rows) })

const mountPicker = () =>
  mount(ProjectPicker, { global: { stubs: { RouterLink: RouterLinkStub } } })

beforeEach(() => {
  useProjects.mockReset()
  useStarredProjects.mockReset()
  useAssignedProjects.mockReset()
  toggleMutate.mockClear()
  mockStarred()
  mockAssigned()
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

  it('groups starred and assigned into sections and de-duplicates rows', () => {
    mockProjects({
      projects: [
        { id: 'gid://1', fullPath: 'g/a', name: 'A' },
        { id: 'gid://2', fullPath: 'g/b', name: 'B' },
        { id: 'gid://3', fullPath: 'g/c', name: 'C' },
      ],
    })
    mockStarred([{ name: 'A', fullPath: 'g/a' }])
    mockAssigned([{ name: 'B', fullPath: 'g/b', assignedOpen: 2 }])

    const w = mountPicker()
    expect(w.text()).toContain('Starred')
    expect(w.text()).toContain('Assigned to me')
    expect(w.text()).toContain('All projects')
    expect(w.text()).toContain('2 open')

    // A (starred) and B (assigned) are lifted out of the main list — three rows,
    // no duplicates.
    const links = w.findAllComponents(RouterLinkStub)
    expect(links).toHaveLength(3)
    const paths = links.map(
      (l) => (l.props('to') as { params: { fullPath: string } }).params.fullPath,
    )
    expect(paths).toEqual(['g/a', 'g/b', 'g/c'])
  })

  it('toggles a star when the star button is clicked', async () => {
    mockProjects({ projects: [{ id: 'gid://1', fullPath: 'g/a', name: 'A' }] })
    const w = mountPicker()
    await w.find('button[aria-label="Star A"]').trigger('click')
    expect(toggleMutate).toHaveBeenCalledWith({ fullPath: 'g/a', name: 'A', starred: false })
  })
})
