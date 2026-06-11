import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import { mount } from '@vue/test-utils'

const fetching = ref(0)
vi.mock('@tanstack/vue-query', () => ({ useIsFetching: () => fetching }))

import ChassisBar from './ChassisBar.vue'

describe('ChassisBar', () => {
  beforeEach(() => {
    fetching.value = 0
  })

  it('is a window drag region with a no-drag lamp', () => {
    const w = mount(ChassisBar)
    expect(w.classes()).toContain('electrobun-webkit-app-region-drag')
    const lamp = w.get('[data-testid="chassis-lamp"]')
    expect(lamp.classes()).toContain('electrobun-webkit-app-region-no-drag')
  })

  it('reserves the macOS traffic-light zone', () => {
    const w = mount(ChassisBar)
    expect(w.classes()).toContain('pl-[96px]')
  })

  it('shows the engraved wordmark by default and a window title when given', () => {
    expect(mount(ChassisBar).text()).toContain('Lumen')
    expect(mount(ChassisBar, { props: { title: 'Settings' } }).text()).toContain('Settings')
  })

  it('breathes the lamp only while queries are in flight', async () => {
    const w = mount(ChassisBar)
    expect(w.get('[data-testid="chassis-lamp"]').classes()).not.toContain('lamp-busy')
    fetching.value = 2
    await w.vm.$nextTick()
    expect(w.get('[data-testid="chassis-lamp"]').classes()).toContain('lamp-busy')
    fetching.value = 0
  })
})
