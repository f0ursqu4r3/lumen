import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import { mount } from '@vue/test-utils'

const idiom = ref<string | null>(null)
vi.mock('@/shared/theme/useIdiom', () => ({ useIdiom: () => idiom }))

import LabelChip from './LabelChip.vue'

describe('LabelChip (chassis dialect)', () => {
  beforeEach(() => {
    idiom.value = null
  })

  it('renders a squared mono printed-label, not a rounded pill', () => {
    const w = mount(LabelChip, { props: { title: 'scope::value', color: '#1f75cb' } })
    const root = w.find('span')
    expect(root.classes()).toContain('rounded-[3px]')
    expect(root.classes()).toContain('font-mono')
    expect(root.classes()).toContain('uppercase')
    expect(root.classes()).not.toContain('rounded-full')
  })

  it('renders as bracketed dim text under the terminal idiom', () => {
    idiom.value = 'terminal'
    const w = mount(LabelChip, { props: { title: 'team::ops', color: '#1f75cb' } })
    expect(w.text()).toBe('[team::ops]')
    expect(w.attributes('style') ?? '').not.toContain('background-color')
  })
})
