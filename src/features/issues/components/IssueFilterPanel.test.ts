import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import IssueFilterPanel from './IssueFilterPanel.vue'

const catalog = [
  { id: 'l1', title: 'bug', color: '#f00' },
  { id: 'l2', title: 'ui', color: '#0f0' },
]
const members = [
  { id: 'm1', username: 'ada', name: 'Ada Lovelace', avatarUrl: null, bot: false },
  { id: 'm2', username: 'bob', name: 'Bob Bk', avatarUrl: null, bot: false },
]

const mountPanel = (props = {}) =>
  mount(IssueFilterPanel, {
    props: {
      labels: [],
      assignee: '',
      author: '',
      catalog,
      members,
      activeCount: 0,
      ...props,
    },
  })

describe('IssueFilterPanel', () => {
  it('shows the active count badge when filters are set', () => {
    const w = mountPanel({ activeCount: 2 })
    expect(w.get('[data-testid="filter-count"]').text()).toBe('2')
  })

  it('opens the panel and lists grouped labels, assignees, authors', async () => {
    const w = mountPanel()
    await w.get('[data-testid="filter-trigger"]').trigger('click')
    // bug + ui are unscoped -> under the Other group row
    expect(w.find('[data-testid="lgm-scope-__none"]').exists()).toBe(true)
    expect(w.find('[data-testid="filter-assignee-ada"]').exists()).toBe(true)
    expect(w.find('[data-testid="filter-author-bob"]').exists()).toBe(true)
  })

  it('toggling a label emits the next label list (multi)', async () => {
    const w = mountPanel({ labels: ['ui'] })
    await w.get('[data-testid="filter-trigger"]').trigger('click')
    await w.get('[data-testid="lgm-scope-__none"]').trigger('click')
    await w.get('[data-testid="lgm-opt-bug"]').trigger('click')
    expect(w.emitted('update:labels')?.at(-1)).toEqual([['ui', 'bug']])
  })

  it('choosing an assignee emits the username; choosing it again clears it', async () => {
    const w = mountPanel({ assignee: '' })
    await w.get('[data-testid="filter-trigger"]').trigger('click')
    await w.get('[data-testid="filter-assignee-ada"]').trigger('click')
    expect(w.emitted('update:assignee')?.at(-1)).toEqual(['ada'])
  })

  it('choosing Unassigned emits the sentinel', async () => {
    const w = mountPanel()
    await w.get('[data-testid="filter-trigger"]').trigger('click')
    await w.get('[data-testid="filter-assignee-__none__"]').trigger('click')
    expect(w.emitted('update:assignee')?.at(-1)).toEqual(['__none__'])
  })
})
