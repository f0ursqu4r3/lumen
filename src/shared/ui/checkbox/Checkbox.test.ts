import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { Checkbox } from './index'

describe('ui/Checkbox', () => {
  it('reflects checked state via data-state', () => {
    const w = mount(Checkbox, { props: { modelValue: true } })
    expect(w.get('[data-slot="checkbox"]').attributes('data-state')).toBe('checked')
  })

  it('reflects unchecked state via data-state', () => {
    const w = mount(Checkbox, { props: { modelValue: false } })
    expect(w.get('[data-slot="checkbox"]').attributes('data-state')).toBe('unchecked')
  })

  it('emits update:modelValue when toggled', async () => {
    const w = mount(Checkbox, { props: { modelValue: false } })
    await w.get('[data-slot="checkbox"]').trigger('click')
    expect(w.emitted('update:modelValue')?.[0]).toEqual([true])
  })
})
