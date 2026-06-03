import { describe, it, expect } from 'vitest'
import { mount, RouterLinkStub } from '@vue/test-utils'
import IssueCard from './IssueCard.vue'

const issue = {
  iid: '7',
  title: 'Crash on save',
  state: 'opened' as const,
  webUrl: '#',
  createdAt: '2026-01-01T00:00:00Z',
  labels: { nodes: [] },
  assignees: { nodes: [] },
}

describe('IssueCard', () => {
  it('opens the issue drawer via the ?issue query', () => {
    const w = mount(IssueCard, {
      props: { issue, fullPath: 'grp/proj' },
      global: { stubs: { RouterLink: RouterLinkStub } },
    })
    expect(w.text()).toContain('Crash on save')
    expect(w.findComponent(RouterLinkStub).props('to')).toEqual({
      query: { issue: '7' },
    })
  })

  it('applies the flash-highlight class when highlight is true', () => {
    const w = mount(IssueCard, {
      props: { issue, fullPath: 'grp/proj', highlight: true },
      global: { stubs: { RouterLink: RouterLinkStub } },
    })
    expect(w.get('div').classes()).toContain('animate-flash')
  })
})
