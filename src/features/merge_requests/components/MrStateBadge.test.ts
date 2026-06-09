import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import MrStateBadge from './MrStateBadge.vue'

describe('MrStateBadge', () => {
  it('shows Draft for an open draft MR', () => {
    const w = mount(MrStateBadge, { props: { state: 'opened', draft: true } })
    expect(w.text()).toBe('Draft')
  })
  it('shows Open / Merged / Closed', () => {
    expect(mount(MrStateBadge, { props: { state: 'opened', draft: false } }).text()).toBe('Open')
    expect(mount(MrStateBadge, { props: { state: 'merged', draft: false } }).text()).toBe('Merged')
    expect(mount(MrStateBadge, { props: { state: 'closed', draft: false } }).text()).toBe('Closed')
  })
})
