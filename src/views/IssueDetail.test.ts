import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'

const useIssue = vi.fn()
vi.mock('@/composables/useIssue', () => ({ useIssue: () => useIssue() }))

import IssueDetail from './IssueDetail.vue'

const mountDetail = () => mount(IssueDetail, { props: { fullPath: 'grp/proj', iid: '9' } })

const fullIssue = {
  id: 'gid://issue/9',
  iid: '9',
  title: 'Bug',
  description: 'the description',
  state: 'opened',
  webUrl: '#',
  milestone: { title: 'v1' },
  labels: { nodes: [] },
  assignees: { nodes: [{ id: 'u1', username: 'a', avatarUrl: null }] },
  notes: {
    nodes: [
      { id: 'n1', body: 'me too', system: false, createdAt: '2026-01-01T00:00:00Z', author: { username: 'a', avatarUrl: null } },
      { id: 'n2', body: 'changed milestone', system: true, createdAt: '2026-01-01T00:00:00Z', author: { username: 'bot', avatarUrl: null } },
    ],
  },
}

beforeEach(() => {
  useIssue.mockReset()
})

describe('IssueDetail', () => {
  it('renders title, description, assignee, and user notes', async () => {
    useIssue.mockReturnValue({ data: ref(fullIssue), isLoading: ref(false), error: ref(null) })
    const w = mountDetail()
    await flushPromises()
    expect(w.text()).toContain('Bug')
    expect(w.text()).toContain('the description')
    expect(w.text()).toContain('@a')
    expect(w.text()).toContain('me too')
  })

  it('hides system notes', async () => {
    useIssue.mockReturnValue({ data: ref(fullIssue), isLoading: ref(false), error: ref(null) })
    const w = mountDetail()
    await flushPromises()
    expect(w.text()).not.toContain('changed milestone')
  })

  it('shows a loading state', () => {
    useIssue.mockReturnValue({ data: ref(undefined), isLoading: ref(true), error: ref(null) })
    expect(mountDetail().text()).toContain('Loading')
  })

  it('shows the error via ErrorNotice', () => {
    useIssue.mockReturnValue({
      data: ref(undefined),
      isLoading: ref(false),
      error: ref({ kind: 'unknown', message: 'boom' }),
    })
    expect(mountDetail().text()).toContain('boom')
  })
})
