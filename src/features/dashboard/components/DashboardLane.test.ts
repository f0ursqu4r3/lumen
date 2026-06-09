import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import DashboardLane from './DashboardLane.vue'

function mountLane(props: Record<string, unknown>) {
  return mount(DashboardLane, {
    props: {
      title: 'Assigned Issues',
      count: 0,
      isLoading: false,
      error: null,
      isEmpty: false,
      emptyMessage: 'Nothing assigned',
      ...props,
    },
    slots: { default: '<li data-testid="row">a row</li>' },
    global: { stubs: { ErrorNotice: { template: '<div data-testid="err"/>' } } },
  })
}

describe('DashboardLane', () => {
  it('renders the title and count', () => {
    const w = mountLane({ count: 3, isEmpty: false })
    expect(w.text()).toContain('Assigned Issues')
    expect(w.text()).toContain('3')
  })
  it('shows a skeleton while loading and no rows', () => {
    const w = mountLane({ isLoading: true })
    expect(w.find('[data-testid="row"]').exists()).toBe(false)
    expect(w.find('[data-testid="lane-skeleton"]').exists()).toBe(true)
  })
  it('shows the error notice on error', () => {
    const w = mountLane({ error: { kind: 'unknown', message: 'x' } })
    expect(w.find('[data-testid="err"]').exists()).toBe(true)
    expect(w.find('[data-testid="row"]').exists()).toBe(false)
  })
  it('shows the empty message when empty', () => {
    const w = mountLane({ isEmpty: true })
    expect(w.text()).toContain('Nothing assigned')
    expect(w.find('[data-testid="row"]').exists()).toBe(false)
  })
  it('renders slot rows otherwise', () => {
    const w = mountLane({ count: 1, isEmpty: false })
    expect(w.find('[data-testid="row"]').exists()).toBe(true)
  })
})
