import { describe, it, expect, vi } from 'vitest'
import { mount, RouterLinkStub } from '@vue/test-utils'
import DashboardIssueRow from './DashboardIssueRow.vue'
import DashboardMrRow from './DashboardMrRow.vue'
import type { DashboardIssue, DashboardMr } from '@/features/dashboard/lib/dashboard'

const { openExternal } = vi.hoisted(() => ({ openExternal: vi.fn() }))
vi.mock('@/shared/lib/rpc', () => ({ rpc: { openExternal } }))

const issue: DashboardIssue = {
  iid: '42',
  title: 'Crash on save',
  state: 'opened',
  reference: 'grp/proj#42',
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

  it('opens externally via the host when the webPath is unparseable', async () => {
    openExternal.mockClear()
    const w = mount(DashboardIssueRow, {
      props: { issue: { ...issue, reference: null, webPath: 'weird' } },
      global: { stubs: { RouterLink: RouterLinkStub } },
    })
    // No in-app route — a button routes the open through the host instead.
    expect(w.findComponent(RouterLinkStub).exists()).toBe(false)
    await w.get('button').trigger('click')
    expect(openExternal).toHaveBeenCalledWith({ url: 'https://gl/issue' })
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
