import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import BulkActionBar from './BulkActionBar.vue'

const base = {
  count: 3,
  catalog: [{ id: 'l1', title: 'bug', color: '#f00' }],
  members: [],
  statuses: [],
}

describe('BulkActionBar', () => {
  it('renders the selected count', () => {
    const w = mount(BulkActionBar, { props: base })
    expect(w.text()).toContain('3 selected')
  })

  it('emits open-combined, select-all, and clear', async () => {
    const w = mount(BulkActionBar, { props: base })
    await w.get('[data-testid="bulk-open-combined"]').trigger('click')
    await w.get('[data-testid="bulk-select-all"]').trigger('click')
    await w.get('[data-testid="bulk-clear"]').trigger('click')
    expect(w.emitted('open-combined')).toHaveLength(1)
    expect(w.emitted('select-all')).toHaveLength(1)
    expect(w.emitted('clear')).toHaveLength(1)
  })
})
