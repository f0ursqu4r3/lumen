import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import LabelChip from './LabelChip.vue'

describe('LabelChip (chassis dialect)', () => {
  it('renders a squared mono printed-label, not a rounded pill', () => {
    const w = mount(LabelChip, { props: { title: 'scope::value', color: '#1f75cb' } })
    const root = w.find('span')
    expect(root.classes()).toContain('rounded-[3px]')
    expect(root.classes()).toContain('font-mono')
    expect(root.classes()).toContain('uppercase')
    expect(root.classes()).not.toContain('rounded-full')
  })
})
