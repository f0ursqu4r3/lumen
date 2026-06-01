import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, RouterLinkStub } from '@vue/test-utils'
import { ref } from 'vue'

const useProjects = vi.fn()
vi.mock('@/composables/useProjects', () => ({ useProjects: () => useProjects() }))

import ProjectPicker from './ProjectPicker.vue'

const mountPicker = () =>
  mount(ProjectPicker, { global: { stubs: { RouterLink: RouterLinkStub } } })

beforeEach(() => {
  useProjects.mockReset()
})

describe('ProjectPicker', () => {
  it('renders a link to each project issue list', () => {
    useProjects.mockReturnValue({
      data: ref([{ id: 'gid://1', fullPath: 'grp/proj', name: 'Proj' }]),
      isLoading: ref(false),
      error: ref(null),
    })
    const w = mountPicker()
    const link = w.findComponent(RouterLinkStub)
    expect(link.text()).toContain('Proj')
    expect(link.props('to')).toEqual({ name: 'issues', params: { fullPath: 'grp/proj' } })
  })

  it('shows a loading state', () => {
    useProjects.mockReturnValue({ data: ref(undefined), isLoading: ref(true), error: ref(null) })
    expect(mountPicker().text()).toContain('Loading')
  })

  it('shows the error via ErrorNotice', () => {
    useProjects.mockReturnValue({
      data: ref(undefined),
      isLoading: ref(false),
      error: ref({ kind: 'unknown', message: 'boom' }),
    })
    expect(mountPicker().text()).toContain('boom')
  })

  it('shows the empty state when there are no projects', () => {
    useProjects.mockReturnValue({ data: ref([]), isLoading: ref(false), error: ref(null) })
    const w = mountPicker()
    expect(w.text()).toContain('No projects')
    expect(w.findComponent(RouterLinkStub).exists()).toBe(false)
  })
})
