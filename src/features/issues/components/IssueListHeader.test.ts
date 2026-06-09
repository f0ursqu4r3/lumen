import { describe, it, expect } from 'vitest'
import { mount, RouterLinkStub } from '@vue/test-utils'
import IssueListHeader from './IssueListHeader.vue'

describe('IssueListHeader', () => {
  it('links to the project merge requests', () => {
    const w = mount(IssueListHeader, {
      props: {
        fullPath: 'grp/proj',
        repoName: 'proj',
        pathPrefix: 'grp',
        runningPipelines: 0,
        runningDotClass: '',
        count: 0,
        hasMore: false,
        isLoading: false,
      },
      global: { stubs: { RouterLink: RouterLinkStub } },
    })
    const targets = w.findAllComponents(RouterLinkStub).map((l) => l.props('to'))
    expect(targets).toContainEqual({ name: 'merge-requests', params: { fullPath: 'grp/proj' } })
  })
})
