import { describe, it, expect, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import ReorderGhost from './ReorderGhost.vue'

afterEach(() => {
  document.querySelectorAll('[data-testid="reorder-ghost"]').forEach((n) => n.remove())
})

const ghost = () => document.body.querySelector('[data-testid="reorder-ghost"]') as HTMLElement | null

describe('ReorderGhost', () => {
  it('renders the label and count, teleported to body', () => {
    const wrapper = mount(ReorderGhost, {
      props: { label: 'Doing', color: '#3b82f6', count: 12, x: 40, y: 60 },
      attachTo: document.body,
    })
    const el = ghost()
    expect(el?.textContent).toContain('Doing')
    expect(el?.textContent).toContain('12')
    wrapper.unmount()
  })

  it('positions itself at the cursor with an offset', () => {
    const wrapper = mount(ReorderGhost, {
      props: { label: 'X', color: null, count: 0, x: 100, y: 200 },
      attachTo: document.body,
    })
    expect(ghost()?.style.transform).toContain('translate(112px, 214px)')
    wrapper.unmount()
  })

  it('omits the color dot when no color is given', () => {
    const wrapper = mount(ReorderGhost, {
      props: { label: 'X', color: null, count: 0, x: 0, y: 0 },
      attachTo: document.body,
    })
    expect(ghost()?.querySelector('[data-testid="ghost-dot"]')).toBeNull()
    wrapper.unmount()
  })
})
