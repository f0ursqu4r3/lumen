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
  it('renders a passthrough (no max-width, no padding) for the bare width', () => {
    const w = mount(ViewContainer, { props: { width: 'bare' }, slots: { default: '<p>x</p>' } })
    const cls = w.classes()
    expect(cls).not.toContain('max-w-5xl')
    expect(cls).not.toContain('mx-auto')
    expect(cls).not.toContain('px-6')
    expect(w.text()).toContain('x')
  })
})
