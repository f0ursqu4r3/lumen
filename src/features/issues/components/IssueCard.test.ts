import { describe, it, expect } from 'vitest'
import { mount, RouterLinkStub } from '@vue/test-utils'
import { ref } from 'vue'
import IssueCard from './IssueCard.vue'
import { IssueSelectionKey, useIssueSelection } from '@/features/issues/composables/useIssueSelection'

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

  it('preserves the current filters when opening the drawer', () => {
    const w = mount(IssueCard, {
      props: { issue, fullPath: 'grp/proj' },
      global: {
        stubs: { RouterLink: RouterLinkStub },
        mocks: { $route: { query: { sort: 'title', label: 'bug' } } },
      },
    })
    expect(w.findComponent(RouterLinkStub).props('to')).toEqual({
      query: { sort: 'title', label: 'bug', issue: '7' },
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

describe('IssueCard — select mode', () => {
  const issue = {
    iid: '7',
    title: 'Crash',
    state: 'opened' as const,
    webUrl: '#',
    createdAt: '2026-01-01T00:00:00Z',
    labels: { nodes: [] },
    assignees: { nodes: [] },
  }

  function mountWithSelection() {
    const selection = useIssueSelection(ref('grp/proj'))
    selection.setMode(true)
    const w = mount(IssueCard, {
      props: { issue, fullPath: 'grp/proj' },
      global: { provide: { [IssueSelectionKey as symbol]: selection } },
    })
    return { w, selection }
  }

  it('shows a checkbox in select mode', () => {
    const { w } = mountWithSelection()
    expect(w.find('[data-slot="checkbox"]').exists()).toBe(true)
  })

  it('toggles selection when the card is clicked in select mode', async () => {
    const { w, selection } = mountWithSelection()
    await w.get('[data-testid="issue-card"]').trigger('click')
    expect(selection.isSelected('7')).toBe(true)
  })
})
