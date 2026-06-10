import { describe, it, expect } from 'vitest'
import { mount, RouterLinkStub } from '@vue/test-utils'
import DashboardIssueRow from './DashboardIssueRow.vue'
import DashboardMrRow from './DashboardMrRow.vue'
import type { DashboardIssue, DashboardMr } from '@/features/dashboard/lib/dashboard'

const issue: DashboardIssue = {
  iid: '42',
  title: 'Crash on save',
  state: 'opened',
  webPath: '/grp/proj/-/issues/42',
  webUrl: 'https://gl/issue',
  updatedAt: new Date().toISOString(),
  labels: { nodes: [] },
}
const mr: DashboardMr = {
  iid: '5',
  title: 'Add API',
  state: 'opened',
  draft: true,
  webUrl: 'https://gl/mr',
  updatedAt: new Date().toISOString(),
  project: { fullPath: 'grp/proj' },
  approved: false,
  approvalsRequired: 1,
  reviewers: { nodes: [] },
}

describe('DashboardIssueRow', () => {
  it('shows the project path + title and opens the issue sheet over its list', () => {
    const w = mount(DashboardIssueRow, {
      props: { issue },
      global: { stubs: { RouterLink: RouterLinkStub } },
    })
    expect(w.text()).toContain('grp/proj')
    expect(w.text()).toContain('Crash on save')
    expect(w.findComponent(RouterLinkStub).props('to')).toEqual({
      name: 'issues',
      params: { fullPath: 'grp/proj' },
      query: { issue: '42' },
    })
  })

  it('falls back to an external link when webPath is unparseable', () => {
    const w = mount(DashboardIssueRow, {
      props: { issue: { ...issue, webPath: 'weird' } },
      global: { stubs: { RouterLink: RouterLinkStub } },
    })
    // No RouterLink — renders an <a href> to webUrl instead.
    expect(w.findComponent(RouterLinkStub).exists()).toBe(false)
    expect(w.find('a').attributes('href')).toBe('https://gl/issue')
  })
})

describe('DashboardMrRow', () => {
  it('shows the project + title + draft badge and links to the MR route', () => {
    const w = mount(DashboardMrRow, {
      props: { mr },
      global: { stubs: { RouterLink: RouterLinkStub } },
    })
    expect(w.text()).toContain('grp/proj')
    expect(w.text()).toContain('Add API')
    expect(w.text()).toContain('Draft')
    expect(w.findComponent(RouterLinkStub).props('to')).toEqual({
      name: 'merge-request',
      params: { fullPath: 'grp/proj', iid: '5' },
    })
  })
})
