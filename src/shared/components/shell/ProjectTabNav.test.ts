import { describe, it, expect, vi } from 'vitest'
import { mount, RouterLinkStub } from '@vue/test-utils'
import { ref } from 'vue'

// Stub the pipelines query so the running adornment is controllable.
const { pipelines } = vi.hoisted(() => ({ pipelines: { value: [] as { status: string }[] } }))
vi.mock('@/features/pipelines/composables/usePipelines', () => ({
  usePipelines: () => ({ pipelines: ref(pipelines.value) }),
}))
// isActivePipeline lives in gitlab/pipelineParams; keep the real one.

// Spy on the tab-nav handler so we can assert clicks route through it (it
// preserves modified-click "open in new window" behavior).
const { onTabNav } = vi.hoisted(() => ({ onTabNav: vi.fn() }))
vi.mock('@/shared/composables/useTabNav', () => ({ useTabNav: () => ({ onTabNav }) }))

import ProjectTabNav from './ProjectTabNav.vue'

function mountNav(props: { fullPath: string; active: string }) {
  return mount(ProjectTabNav, { props, global: { stubs: { RouterLink: RouterLinkStub } } })
}

describe('ProjectTabNav', () => {
  it('links to the three project surfaces for the fullPath', () => {
    const targets = mountNav({ fullPath: 'grp/proj', active: 'issues' })
      .findAllComponents(RouterLinkStub)
      .map((l) => l.props('to'))
    expect(targets).toContainEqual({ name: 'issues', params: { fullPath: 'grp/proj' } })
    expect(targets).toContainEqual({ name: 'merge-requests', params: { fullPath: 'grp/proj' } })
    expect(targets).toContainEqual({ name: 'pipelines', params: { fullPath: 'grp/proj' } })
  })

  it('marks the active tab with aria-current', () => {
    const w = mountNav({ fullPath: 'grp/proj', active: 'merge-requests' })
    const active = w
      .findAllComponents(RouterLinkStub)
      .find((l) => (l.props('to') as { name: string }).name === 'merge-requests')!
    expect(active.attributes('aria-current')).toBe('page')
  })

  it('shows a running count on the Pipelines tab when pipelines are active', () => {
    pipelines.value = [{ status: 'RUNNING' }, { status: 'SUCCESS' }, { status: 'PENDING' }]
    const w = mountNav({ fullPath: 'grp/proj', active: 'issues' })
    expect(w.get('[data-testid="tab-pipelines-running"]').text()).toContain('2')
    pipelines.value = []
  })

  it('routes tab clicks through onTabNav', async () => {
    onTabNav.mockClear()
    const w = mountNav({ fullPath: 'grp/proj', active: 'issues' })
    const mrTab = w
      .findAllComponents(RouterLinkStub)
      .find((l) => (l.props('to') as { name: string }).name === 'merge-requests')!
    await mrTab.trigger('click')
    expect(onTabNav).toHaveBeenCalledWith(expect.anything(), {
      name: 'merge-requests',
      params: { fullPath: 'grp/proj' },
    })
  })
})
