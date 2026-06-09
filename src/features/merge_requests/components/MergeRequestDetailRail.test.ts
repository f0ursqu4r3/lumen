import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import MergeRequestDetailRail from './MergeRequestDetailRail.vue'

const mr = {
  sourceBranch: 'feat/api',
  targetBranch: 'main',
  approved: false,
  approvalsRequired: 2,
  conflicts: true,
  mergeableDiscussionsState: true,
  reviewers: { nodes: [{ name: 'Ray', username: 'ray' }] },
  assignees: { nodes: [] },
  labels: { nodes: [] },
  milestone: { id: 'm1', title: 'v1' },
  headPipeline: { id: 'p1', status: 'SUCCESS' },
}

describe('MergeRequestDetailRail', () => {
  it('shows branches, approvals, reviewers, milestone and a conflicts note', () => {
    const w = mount(MergeRequestDetailRail, {
      props: { mr },
      global: { stubs: { PipelineStatusBadge: true } },
    })
    expect(w.text()).toContain('feat/api')
    expect(w.text()).toContain('main')
    expect(w.text()).toContain('v1')
    expect(w.text()).toContain('Ray')
    expect(w.text()).toContain('Not approved')
    expect(w.text()).toContain('2 required')
    expect(w.text().toLowerCase()).toContain('conflict')
  })
})
