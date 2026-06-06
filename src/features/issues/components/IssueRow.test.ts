import { describe, it, expect } from 'vitest'
import { mount, RouterLinkStub } from '@vue/test-utils'
import { ref } from 'vue'
import IssueRow from './IssueRow.vue'
import {
  IssueSelectionKey,
  useIssueSelection,
} from '@/features/issues/composables/useIssueSelection'

const issue = {
  iid: '7',
  title: 'Crash on save',
  state: 'opened' as const,
  webUrl: '#',
  createdAt: '2026-01-01T00:00:00Z',
  labels: { nodes: [{ id: 'l1', title: 'bug', color: '#f00' }] },
  assignees: { nodes: [] },
}

describe('IssueRow', () => {
  it('links to the issue drawer and shows the title + label', () => {
    const w = mount(IssueRow, {
      props: { issue, fullPath: 'grp/proj' },
      global: { stubs: { RouterLink: RouterLinkStub } },
    })
    expect(w.text()).toContain('Crash on save')
    expect(w.text()).toContain('bug')
    expect(w.findComponent(RouterLinkStub).props('to')).toEqual({
      query: { issue: '7' },
    })
  })

  it('preserves the current filters when opening the drawer', () => {
    const w = mount(IssueRow, {
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
    const w = mount(IssueRow, {
      props: { issue, fullPath: 'grp/proj', highlight: true },
      global: { stubs: { RouterLink: RouterLinkStub } },
    })
    expect(w.get('div').classes()).toContain('animate-flash')
  })
})

describe('IssueRow — select mode', () => {
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
    const w = mount(IssueRow, {
      props: { issue, fullPath: 'grp/proj' },
      global: {
        stubs: { RouterLink: RouterLinkStub },
        provide: { [IssueSelectionKey as symbol]: selection },
      },
    })
    return { w, selection }
  }

  it('shows a checkbox in select mode and hides the navigation overlay', () => {
    const { w } = mountWithSelection()
    expect(w.find('[data-slot="checkbox"]').exists()).toBe(true)
    expect(w.findComponent(RouterLinkStub).exists()).toBe(false)
  })

  it('toggles selection when the row body is clicked in select mode', async () => {
    const { w, selection } = mountWithSelection()
    await w.get('[data-testid="issue-row"]').trigger('click')
    expect(selection.isSelected('7')).toBe(true)
  })
})
