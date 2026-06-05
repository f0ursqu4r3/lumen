import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import StatusPicker from './StatusPicker.vue'
import type { WorkItemStatus } from '@/composables/useWorkItemStatus'

const statuses: WorkItemStatus[] = [
  { id: 'gid://s/1', name: 'To do', color: '#737278', iconName: 'status-waiting', category: 'to_do' },
  {
    id: 'gid://s/2',
    name: 'In progress',
    color: '#1f75cb',
    iconName: 'status-running',
    category: 'in_progress',
  },
  { id: 'gid://s/3', name: 'Done', color: '#108548', iconName: 'status-success', category: 'done' },
]

describe('StatusPicker', () => {
  it('shows the current status on the trigger', () => {
    const w = mount(StatusPicker, { props: { statuses, current: statuses[0] } })
    expect(w.get('[data-testid="status-picker-trigger"]').text()).toContain('To do')
  })

  it('falls back to "Set status" when none is set', () => {
    const w = mount(StatusPicker, { props: { statuses, current: null } })
    expect(w.get('[data-testid="status-picker-trigger"]').text()).toContain('Set status')
  })

  it('opens the menu and emits the chosen status', async () => {
    const w = mount(StatusPicker, { props: { statuses, current: statuses[0] } })
    await w.get('[data-testid="status-picker-trigger"]').trigger('click')
    await w.get('[data-testid="status-opt-In progress"]').trigger('click')
    expect(w.emitted('select')?.at(-1)).toEqual([statuses[1]])
  })

  it('does not re-emit when the current status is chosen', async () => {
    const w = mount(StatusPicker, { props: { statuses, current: statuses[0] } })
    await w.get('[data-testid="status-picker-trigger"]').trigger('click')
    await w.get('[data-testid="status-opt-To do"]').trigger('click')
    expect(w.emitted('select')).toBeUndefined()
  })

  it('filters the list by the search box', async () => {
    const w = mount(StatusPicker, { props: { statuses, current: statuses[0] } })
    await w.get('[data-testid="status-picker-trigger"]').trigger('click')
    await w.get('[data-testid="status-search"]').setValue('prog')
    expect(w.find('[data-testid="status-opt-In progress"]').exists()).toBe(true)
    expect(w.find('[data-testid="status-opt-To do"]').exists()).toBe(false)
  })

  it('disables the trigger while a change is pending', () => {
    const w = mount(StatusPicker, { props: { statuses, current: statuses[0], pending: true } })
    expect(w.get('[data-testid="status-picker-trigger"]').attributes('disabled')).toBeDefined()
  })

  it('disables the trigger when there are no statuses', () => {
    const w = mount(StatusPicker, { props: { statuses: [], current: null } })
    const trigger = w.get('[data-testid="status-picker-trigger"]')
    expect(trigger.attributes('disabled')).toBeDefined()
    expect(trigger.text()).toContain('No statuses')
  })
})
