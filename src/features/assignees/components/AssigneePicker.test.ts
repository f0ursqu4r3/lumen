import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import AssigneePicker from './AssigneePicker.vue'

const members = [
  { id: 'gid://user/1', username: 'kdougan', name: 'K D', avatarUrl: null, bot: false },
  { id: 'gid://user/2', username: 'mira', name: 'Mira', avatarUrl: null, bot: false },
]

describe('AssigneePicker', () => {
  it('selects a member, emitting their id', async () => {
    const w = mount(AssigneePicker, { props: { members, modelValue: null } })
    await w.get('[data-testid="assignee-picker-trigger"]').trigger('click')
    await w.get('[data-testid="assignee-option-mira"]').trigger('click')
    expect(w.emitted('update:modelValue')?.at(-1)).toEqual(['gid://user/2'])
  })

  it('clears when the selected member is clicked again', async () => {
    const w = mount(AssigneePicker, { props: { members, modelValue: 'gid://user/2' } })
    await w.get('[data-testid="assignee-picker-trigger"]').trigger('click')
    await w.get('[data-testid="assignee-option-mira"]').trigger('click')
    expect(w.emitted('update:modelValue')?.at(-1)).toEqual([null])
  })

  it('shows the selected member username on the trigger', () => {
    const w = mount(AssigneePicker, { props: { members, modelValue: 'gid://user/1' } })
    expect(w.get('[data-testid="assignee-picker-trigger"]').text()).toContain('kdougan')
  })

  it('lists members alphabetically by name regardless of incoming order', async () => {
    const unsorted = [
      { id: 'gid://user/3', username: 'zed', name: 'Zed', avatarUrl: null, bot: false },
      { id: 'gid://user/1', username: 'amy', name: 'Amy', avatarUrl: null, bot: false },
      { id: 'gid://user/2', username: 'mira', name: 'Mira', avatarUrl: null, bot: false },
    ]
    const w = mount(AssigneePicker, { props: { members: unsorted, modelValue: null } })
    await w.get('[data-testid="assignee-picker-trigger"]').trigger('click')
    const order = w
      .findAll('[data-testid^="assignee-option-"]')
      .map((b) => b.attributes('data-testid'))
    expect(order).toEqual(['assignee-option-amy', 'assignee-option-mira', 'assignee-option-zed'])
  })

  it('filters members by name or username as you type', async () => {
    const w = mount(AssigneePicker, { props: { members, modelValue: null } })
    await w.get('[data-testid="assignee-picker-trigger"]').trigger('click')
    await w.get('[data-testid="assignee-search"]').setValue('mir')
    const order = w
      .findAll('[data-testid^="assignee-option-"]')
      .map((b) => b.attributes('data-testid'))
    expect(order).toEqual(['assignee-option-mira'])
  })

  it('shows the empty state when nothing matches the filter', async () => {
    const w = mount(AssigneePicker, { props: { members, modelValue: null } })
    await w.get('[data-testid="assignee-picker-trigger"]').trigger('click')
    await w.get('[data-testid="assignee-search"]').setValue('zzz')
    expect(w.findAll('[data-testid^="assignee-option-"]')).toHaveLength(0)
    expect(w.text()).toContain('No members found.')
  })
})
