import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import LabelPicker from './LabelPicker.vue'

const catalog = [
  { id: 'l1', title: 'bug', color: '#f00' },
  { id: 'l2', title: 'priority::high', color: '#fa0' },
  { id: 'l3', title: 'priority::low', color: '#0a0' },
]

describe('LabelPicker', () => {
  it('toggles an unscoped label, emitting selected titles', async () => {
    const w = mount(LabelPicker, { props: { catalog, modelValue: [] } })
    await w.get('[data-testid="label-picker-trigger"]').trigger('click')
    await w.get('[data-testid="lgm-scope-__none"]').trigger('click')
    await w.get('[data-testid="lgm-opt-bug"]').trigger('click')
    expect(w.emitted('update:modelValue')?.at(-1)).toEqual([['bug']])
  })

  it('enforces one value per scope (exclusivity)', async () => {
    const w = mount(LabelPicker, {
      props: { catalog, modelValue: ['priority::low'] },
    })
    await w.get('[data-testid="label-picker-trigger"]').trigger('click')
    await w.get('[data-testid="lgm-scope-priority"]').trigger('click')
    await w.get('[data-testid="lgm-opt-priority::high"]').trigger('click')
    expect(w.emitted('update:modelValue')?.at(-1)).toEqual([['priority::high']])
  })

  it('deselects an already-selected label', async () => {
    const w = mount(LabelPicker, { props: { catalog, modelValue: ['bug'] } })
    await w.get('[data-testid="label-picker-trigger"]').trigger('click')
    await w.get('[data-testid="lgm-scope-__none"]').trigger('click')
    await w.get('[data-testid="lgm-opt-bug"]').trigger('click')
    expect(w.emitted('update:modelValue')?.at(-1)).toEqual([[]])
  })

  it('renders the selected labels as chips', () => {
    const w = mount(LabelPicker, { props: { catalog, modelValue: ['bug'] } })
    expect(w.text()).toContain('bug')
  })
})
