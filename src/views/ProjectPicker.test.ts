import { describe, it, expect, vi } from 'vitest'
import { mount, RouterLinkStub } from '@vue/test-utils'
import { ref } from 'vue'

vi.mock('@/composables/useProjects', () => ({
  useProjects: () => ({
    data: ref([{ id: 'gid://1', fullPath: 'grp/proj', name: 'Proj' }]),
    isLoading: ref(false),
    error: ref(null),
  }),
}))

import ProjectPicker from './ProjectPicker.vue'

describe('ProjectPicker', () => {
  it('renders a link to each project issue list', () => {
    const w = mount(ProjectPicker, { global: { stubs: { RouterLink: RouterLinkStub } } })
    const link = w.findComponent(RouterLinkStub)
    expect(link.text()).toContain('Proj')
    expect(link.props('to')).toEqual({ name: 'issues', params: { fullPath: 'grp/proj' } })
  })
})
