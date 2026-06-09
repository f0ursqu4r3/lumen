import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import BulkActionBar from './BulkActionBar.vue'

// The bar teleports to <body> in the app; stub teleport so it renders inline in
// the wrapper for assertions.
const mountBar = (
  props: InstanceType<typeof BulkActionBar>['$props'],
  opts: Record<string, unknown> = {},
) => mount(BulkActionBar, { props, global: { stubs: { teleport: true } }, ...opts })

const base = {
  count: 3,
  catalog: [{ id: 'l1', title: 'bug', color: '#f00' }],
  members: [],
  statuses: [],
}

const STATUS = {
  id: 's1',
  name: 'In progress',
  color: '#88a',
  iconName: 'status_running',
  category: 'in_progress',
}
const withStatuses = { ...base, statuses: [STATUS] }

describe('BulkActionBar', () => {
  it('renders the selected count', () => {
    const w = mountBar(base)
    expect(w.text()).toContain('3 selected')
  })

  it('emits open-combined, select-all, and clear', async () => {
    const w = mountBar(base)
    await w.get('[data-testid="bulk-open-combined"]').trigger('click')
    await w.get('[data-testid="bulk-select-all"]').trigger('click')
    await w.get('[data-testid="bulk-clear"]').trigger('click')
    expect(w.emitted('open-combined')).toHaveLength(1)
    expect(w.emitted('select-all')).toHaveLength(1)
    expect(w.emitted('clear')).toHaveLength(1)
  })

  it('opening one menu closes the others (mutual exclusion)', async () => {
    const w = mountBar(base)
    await w.get('[data-testid="bulk-labels"]').trigger('click')
    expect(w.find('[data-testid="bulk-apply-labels"]').exists()).toBe(true)
    await w.get('[data-testid="bulk-assign"]').trigger('click')
    expect(w.find('[data-testid="bulk-apply-labels"]').exists()).toBe(false)
    expect(w.find('[data-testid="bulk-apply-assignee"]').exists()).toBe(true)
  })

  it('clicking outside the bar closes the open menu', async () => {
    const w = mountBar(base, { attachTo: document.body })
    await w.get('[data-testid="bulk-labels"]').trigger('click')
    expect(w.find('[data-testid="bulk-apply-labels"]').exists()).toBe(true)
    // onClickOutside fires on `click` with a 0ms debounce after the opening click;
    // let that clear, then click on the document body (outside the bar).
    await new Promise((r) => setTimeout(r, 1))
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await nextTick()
    expect(w.find('[data-testid="bulk-apply-labels"]').exists()).toBe(false)
    w.unmount()
  })

  it('toggling the same menu closes it', async () => {
    const w = mountBar(base)
    await w.get('[data-testid="bulk-labels"]').trigger('click')
    expect(w.find('[data-testid="bulk-apply-labels"]').exists()).toBe(true)
    await w.get('[data-testid="bulk-labels"]').trigger('click')
    expect(w.find('[data-testid="bulk-apply-labels"]').exists()).toBe(false)
  })

  it('Status opens an upward popover (not off-screen) and emits set-status on pick', async () => {
    const w = mountBar(withStatuses)
    await w.get('[data-testid="bulk-status"]').trigger('click')
    const panel = w.get('[data-testid="bulk-status-panel"]')
    // Opens upward (above the bottom-anchored bar) so it stays on-screen.
    expect(panel.classes()).toContain('bottom-full')
    await w.get('[data-testid="bulk-status-opt-In progress"]').trigger('click')
    expect(w.emitted('set-status')?.[0]?.[0]).toMatchObject({ id: 's1' })
    // Picking closes the menu.
    expect(w.find('[data-testid="bulk-status-panel"]').exists()).toBe(false)
  })

  it('hides the Status trigger when there are no statuses', () => {
    const w = mountBar(base)
    expect(w.find('[data-testid="bulk-status"]').exists()).toBe(false)
  })
})
