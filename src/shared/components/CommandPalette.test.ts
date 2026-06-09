import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

// vi.mock is hoisted above module-level consts, so the spy must be created via
// vi.hoisted to be initialized before the factory runs.
const { action } = vi.hoisted(() => ({ action: vi.fn() }))

vi.mock('@/features/palette/composables/usePaletteCommands', () => {
  const { ref } = require('vue')
  const cmd = {
    id: 'settings',
    group: 'Actions',
    title: 'Open Settings',
    subtitle: 'x',
    icon: 'span',
    action,
  }
  const groups = ref([{ group: 'Actions', items: [cmd] }])
  const flat = ref([cmd])
  return { usePaletteCommands: () => ({ groups, flat, isSearching: ref(false) }) }
})

import CommandPalette from './CommandPalette.vue'

beforeEach(() => {
  action.mockReset()
})

function open() {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))
}

describe('CommandPalette', () => {
  it('opens on Cmd+K and renders the group header and item', async () => {
    const wrapper = mount(CommandPalette, { attachTo: document.body })
    open()
    await flushPromises()
    expect(document.body.textContent).toContain('Actions')
    expect(document.body.textContent).toContain('Open Settings')
    wrapper.unmount()
  })

  it('runs the active command on Enter', async () => {
    const wrapper = mount(CommandPalette, { attachTo: document.body })
    open()
    await flushPromises()
    const input = document.body.querySelector('input')!
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await flushPromises()
    expect(action).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })
})
