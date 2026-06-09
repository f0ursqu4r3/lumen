import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { nextTick } from 'vue'

// vi.mock is hoisted above module-level consts, so the spy must be created via
// vi.hoisted to be initialized before the factory runs.
const { action } = vi.hoisted(() => ({ action: vi.fn() }))

vi.mock('@/features/palette/composables/usePaletteCommands', async () => {
  const { ref } = await import('vue')
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

// reka-ui's Dialog teleports content to <body>; unmount() doesn't reliably clean
// the teleported subtree, so reset the DOM between tests to avoid leakage.
afterEach(() => {
  document.body.innerHTML = ''
})

function open() {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))
}

describe('CommandPalette', () => {
  it('opens on Cmd+K and renders the group header and item', async () => {
    const wrapper = mount(CommandPalette, { attachTo: document.body })
    open()
    await nextTick()
    await flushPromises()
    expect(document.body.textContent).toContain('Actions')
    expect(document.body.textContent).toContain('Open Settings')
    wrapper.unmount()
  })

  it('runs the active command on Enter', async () => {
    const wrapper = mount(CommandPalette, { attachTo: document.body })
    open()
    await nextTick()
    await flushPromises()
    const input = document.body.querySelector('input')!
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await flushPromises()
    expect(action).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })
})
