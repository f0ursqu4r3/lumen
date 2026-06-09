import { describe, it, expect } from 'vitest'
import { mount, RouterLinkStub } from '@vue/test-utils'
import MergeRequestRow from './MergeRequestRow.vue'
import type { MergeRequestListItem } from '@/features/merge_requests/composables/useMergeRequests'

const mr: MergeRequestListItem = {
  iid: '5',
  title: 'Add API',
  state: 'opened',
  draft: true,
  conflicts: false,
  webUrl: '#',
  createdAt: 't',
  updatedAt: 't',
  mergedAt: null,
  sourceBranch: 'feat/api',
  targetBranch: 'main',
  approved: false,
  approvalsRequired: 2,
  author: { name: 'Ada', username: 'ada' },
  assignees: { nodes: [] },
  reviewers: { nodes: [{ name: 'Ray', username: 'ray' }] },
  labels: { nodes: [] },
  milestone: null,
  headPipeline: null,
}

function mountRow() {
  return mount(MergeRequestRow, {
    props: { mr, fullPath: 'grp/proj' },
    global: { stubs: { RouterLink: RouterLinkStub } },
  })
}

describe('MergeRequestRow', () => {
  it('renders title, branches and the draft badge', () => {
    const w = mountRow()
    expect(w.text()).toContain('Add API')
    expect(w.text()).toContain('feat/api')
    expect(w.text()).toContain('main')
    expect(w.text()).toContain('Draft')
  })

  it('links to the MR detail route', () => {
    const link = mountRow().findComponent(RouterLinkStub)
    expect(link.props('to')).toEqual({
      name: 'merge-request',
      params: { fullPath: 'grp/proj', iid: '5' },
    })
  })
})
