import { describe, it, expect } from 'vitest'
import { mount, RouterLinkStub } from '@vue/test-utils'
import MergeRequestListHeader from './MergeRequestListHeader.vue'

function mountHeader() {
  return mount(MergeRequestListHeader, {
    props: { fullPath: 'grp/proj', repoName: 'proj', count: 3 },
    global: { stubs: { RouterLink: RouterLinkStub } },
  })
}

describe('MergeRequestListHeader', () => {
  it('renders the repo name and a link back to issues', () => {
    const w = mountHeader()
    expect(w.text()).toContain('proj')
    const links = w.findAllComponents(RouterLinkStub).map((l) => l.props('to'))
    expect(links).toContainEqual({ name: 'issues', params: { fullPath: 'grp/proj' } })
    expect(links).toContainEqual({ name: 'projects' })
  })
})
