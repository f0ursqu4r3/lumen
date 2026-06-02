import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import LabelPicker from './LabelPicker.vue'

const catalog = [
  { id: 'l1', title: 'bug', color: '#f00' },
  { id: 'l2', title: 'priority::high', color: '#fa0' },
]

describe('LabelPicker', () => {
  it('opens the panel and toggles a label, emitting selected titles', async () => {
    const w = mount(LabelPicker, { props: { catalog, modelValue: [] } })
    await w.get('[data-testid="label-picker-trigger"]').trigger('click')
    await w.get('[data-testid="label-option-bug"]').trigger('click')
    expect(w.emitted('update:modelValue')?.at(-1)).toEqual([['bug']])
  })

  it('deselects an already-selected label', async () => {
    const w = mount(LabelPicker, { props: { catalog, modelValue: ['bug'] } })
    await w.get('[data-testid="label-picker-trigger"]').trigger('click')
    await w.get('[data-testid="label-option-bug"]').trigger('click')
    expect(w.emitted('update:modelValue')?.at(-1)).toEqual([[]])
  })

  it('renders the selected labels as chips', () => {
    const w = mount(LabelPicker, { props: { catalog, modelValue: ['bug'] } })
    expect(w.text()).toContain('bug')
  })
})
