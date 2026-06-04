import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'

import AssigneeEditor from './AssigneeEditor.vue'

const issue = {
  author: { username: 'reporter', name: 'Rita Reporter', avatarUrl: null },
  assignees: {
    nodes: [
      { id: 'u1', username: 'ada', name: 'Ada Lovelace', avatarUrl: null },
      { id: 'u2', username: 'bob', name: 'Bob Bk', avatarUrl: null },
    ],
  },
  notes: { nodes: [] },
}
const members = [
  { id: 'm1', username: 'ada', name: 'Ada Lovelace', avatarUrl: null, bot: false },
  { id: 'm2', username: 'bob', name: 'Bob Bk', avatarUrl: null, bot: false },
  { id: 'm4', username: 'dee', name: 'Dee', avatarUrl: null, bot: false },
]

const mountEditor = (usernames = ['ada', 'bob']) =>
  mount(AssigneeEditor, {
    props: { issue: issue as never, members, usernames },
  })

describe('AssigneeEditor (controlled)', () => {
  it('renders a row per current assignee from the usernames prop', () => {
    const w = mountEditor()
    expect(w.find('[data-testid="assignee-remove-ada"]').exists()).toBe(true)
    expect(w.text()).toContain('Ada Lovelace')
  })

  it('removing a current assignee emits the minus list', async () => {
    const w = mountEditor()
    await w.get('[data-testid="assignee-remove-ada"]').trigger('click')
    expect(w.emitted('update:usernames')?.at(-1)).toEqual([['bob']])
  })

  it('adding an unassigned member emits the plus list', async () => {
    const w = mountEditor()
    await w.get('[data-testid="assignee-add-trigger"]').trigger('click')
    await w.get('[data-testid="assignee-option-dee"]').trigger('click')
    expect(w.emitted('update:usernames')?.at(-1)).toEqual([['ada', 'bob', 'dee']])
  })

  it('checkmark reflects the usernames prop', async () => {
    const w = mountEditor(['ada'])
    await w.get('[data-testid="assignee-add-trigger"]').trigger('click')
    expect(w.find('[data-testid="assignee-checked-ada"]').exists()).toBe(true)
    expect(w.find('[data-testid="assignee-checked-dee"]').exists()).toBe(false)
  })

  it('filters people across sections by name or username', async () => {
    const w = mountEditor()
    await w.get('[data-testid="assignee-add-trigger"]').trigger('click')
    await w.get('[data-testid="assignee-search"]').setValue('dee')
    const order = w
      .findAll('[data-testid^="assignee-option-"]')
      .map((b) => b.attributes('data-testid'))
    expect(order).toEqual(['assignee-option-dee'])
  })

  it('shows the empty state when nothing matches the filter', async () => {
    const w = mountEditor()
    await w.get('[data-testid="assignee-add-trigger"]').trigger('click')
    await w.get('[data-testid="assignee-search"]').setValue('zzz')
    expect(w.findAll('[data-testid^="assignee-option-"]')).toHaveLength(0)
    expect(w.text()).toContain('No people found.')
  })
})
