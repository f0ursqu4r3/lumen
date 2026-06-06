import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import AssigneeMenu from './AssigneeMenu.vue'
import type { AssigneeSection } from '@/features/assignees/lib/assigneeOrder'

const sections: AssigneeSection[] = [
  {
    rel: 'assignee',
    label: 'Assigned',
    people: [
      {
        username: 'ada',
        name: 'Ada Lovelace',
        avatarUrl: null,
        relationship: 'assignee',
        isAssigned: true,
      },
    ],
  },
  {
    rel: 'member',
    label: 'Project members',
    people: [
      {
        username: 'bob',
        name: 'Bob Bk',
        avatarUrl: null,
        relationship: 'member',
        isAssigned: false,
      },
      { username: 'dee', name: 'Dee', avatarUrl: null, relationship: 'member', isAssigned: false },
    ],
  },
]

const mountMenu = (selected: string[] = []) =>
  mount(AssigneeMenu, {
    props: { sections, selected, menuLabel: 'Add assignee', testidPrefix: 'assignee' },
  })

describe('AssigneeMenu', () => {
  it('emits the chosen username on click', async () => {
    const w = mountMenu()
    await w.get('[data-testid="assignee-option-dee"]').trigger('click')
    expect(w.emitted('select')?.at(-1)).toEqual(['dee'])
  })

  it('marks selected people with a checkmark', () => {
    const w = mountMenu(['ada'])
    expect(w.find('[data-testid="assignee-checked-ada"]').exists()).toBe(true)
    expect(w.find('[data-testid="assignee-checked-bob"]').exists()).toBe(false)
  })

  it('filters across sections by name or username', async () => {
    const w = mountMenu()
    await w.get('[data-testid="assignee-search"]').setValue('bob')
    const order = w
      .findAll('[data-testid^="assignee-option-"]')
      .map((b) => b.attributes('data-testid'))
    expect(order).toEqual(['assignee-option-bob'])
  })

  it('shows the empty state when nothing matches', async () => {
    const w = mountMenu()
    await w.get('[data-testid="assignee-search"]').setValue('zzz')
    expect(w.findAll('[data-testid^="assignee-option-"]')).toHaveLength(0)
    expect(w.text()).toContain('No people found.')
  })

  it('uses the testid prefix for option ids', () => {
    const w = mount(AssigneeMenu, {
      props: { sections, selected: [], menuLabel: 'Quick assign', testidPrefix: 'quick-assign' },
    })
    expect(w.find('[data-testid="quick-assign-option-ada"]').exists()).toBe(true)
  })
})
