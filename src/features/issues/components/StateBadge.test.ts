import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import { mount } from '@vue/test-utils'

const idiom = ref<string | null>(null)
vi.mock('@/shared/theme/useIdiom', () => ({ useIdiom: () => idiom }))

import StateBadge from './StateBadge.vue'

describe('StateBadge', () => {
  beforeEach(() => {
    idiom.value = null
  })

  it('renders the pill dialect by default', () => {
    expect(mount(StateBadge, { props: { state: 'opened' } }).text()).toBe('Open')
  })

  it('renders bracketed phosphor text under the terminal idiom', () => {
    idiom.value = 'terminal'
    expect(mount(StateBadge, { props: { state: 'opened' } }).text()).toBe('[OPEN]')
    expect(mount(StateBadge, { props: { state: 'closed' } }).text()).toBe('[CLOSED]')
  })
})
