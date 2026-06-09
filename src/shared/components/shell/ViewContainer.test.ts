import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ViewContainer from './ViewContainer.vue'

describe('ViewContainer', () => {
  it('defaults to the medium width', () => {
    const w = mount(ViewContainer, { slots: { default: '<p>body</p>' } })
    expect(w.classes()).toContain('max-w-5xl')
    expect(w.text()).toContain('body')
  })
  it('applies narrow and wide widths', () => {
    expect(mount(ViewContainer, { props: { width: 'narrow' } }).classes()).toContain('max-w-3xl')
    expect(mount(ViewContainer, { props: { width: 'wide' } }).classes()).toContain('max-w-7xl')
  })
})
