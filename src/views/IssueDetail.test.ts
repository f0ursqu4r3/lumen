import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'

vi.mock('@/composables/useIssue', () => ({
  useIssue: () => ({
    data: ref({
      id: 'gid://issue/9', iid: '9', title: 'Bug', description: 'the description', state: 'opened', webUrl: '#',
      milestone: { title: 'v1' }, labels: { nodes: [] }, assignees: { nodes: [{ id: 'u1', username: 'a', avatarUrl: null }] },
      notes: { nodes: [{ id: 'n1', body: 'me too', system: false, createdAt: '2026-01-01T00:00:00Z', author: { username: 'a', avatarUrl: null } }] },
    }),
    isLoading: ref(false), error: ref(null),
  }),
}))

import IssueDetail from './IssueDetail.vue'

describe('IssueDetail', () => {
  it('renders title, description, assignee, and notes', async () => {
    const w = mount(IssueDetail, { props: { fullPath: 'grp/proj', iid: '9' } })
    await flushPromises()
    expect(w.text()).toContain('Bug')
    expect(w.text()).toContain('the description')
    expect(w.text()).toContain('@a')
    expect(w.text()).toContain('me too')
  })
})
