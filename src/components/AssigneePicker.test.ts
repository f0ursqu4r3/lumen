import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import AssigneePicker from './AssigneePicker.vue'

const members = [
  { id: 'gid://user/1', username: 'kdougan', name: 'K D', avatarUrl: null },
  { id: 'gid://user/2', username: 'mira', name: 'Mira', avatarUrl: null },
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
})
