import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import Odometer from './Odometer.vue'

describe('Odometer', () => {
  it('renders one cell per digit and the plain value for assistive tech', () => {
    const w = mount(Odometer, { props: { value: 47 } })
    expect(w.findAll('.odo__cell')).toHaveLength(2)
    // Visible glyphs concatenate to the number…
    expect(w.find('.odo').text()).toBe('47')
    // …and the accessible value mirrors it.
    expect(w.find('.sr-only').text()).toBe('47')
  })

  it('rolls down when the value shrinks (filtering narrows the set)', async () => {
    const w = mount(Odometer, { props: { value: 47 } })
    await w.setProps({ value: 12 })
    await nextTick()
    expect(w.find('.odo').text()).toBe('12')
    expect(w.find('.sr-only').text()).toBe('12')
  })

  it('keeps the units column stable as the digit count changes', async () => {
    const w = mount(Odometer, { props: { value: 9 } })
    expect(w.findAll('.odo__cell')).toHaveLength(1)
    await w.setProps({ value: 10 })
    await nextTick()
    expect(w.findAll('.odo__cell')).toHaveLength(2)
    expect(w.find('.odo').text()).toBe('10')
  })

  it('renders zero', () => {
    const w = mount(Odometer, { props: { value: 0 } })
    expect(w.find('.odo').text()).toBe('0')
  })
})
