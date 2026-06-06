import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import IssueListGroups from './IssueListGroups.vue'
import type { IssueGroup } from '@/features/issues/lib/issueView'

const groups: IssueGroup[] = [
  { key: 'a', label: 'A', issues: [] },
  { key: 'b', label: 'B', color: '#22c55e', issues: [] },
]

function makeProps(over: Record<string, unknown> = {}) {
  return {
    groups,
    groupKey: 'status',
    fullPath: 'grp/proj',
    highlightIid: null,
    vtNameFor: () => undefined,
    activeKey: null,
    insertIndex: null,
    barOffset: null,
    pointer: null,
    justReordered: null,
    dimension: 'status',
    start: vi.fn(),
    ...over,
  }
}
const stubs = { IssueRow: true, Card: true }

afterEach(() => {
  document.querySelectorAll('[data-testid="reorder-ghost"]').forEach((n) => n.remove())
})

describe('IssueListGroups reorder', () => {
  it('starts a reorder on grip pointerdown', async () => {
    const start = vi.fn()
    const wrapper = mount(IssueListGroups, {
      props: makeProps({ start }),
      global: { stubs },
      attachTo: document.body,
    })
    const grips = wrapper.findAll('[data-testid="group-grip"]')
    expect(grips).toHaveLength(2)
    await grips[0].trigger('pointerdown')
    expect(start).toHaveBeenCalledTimes(1)
    expect(start.mock.calls[0][0]).toBe('a')
    expect(start.mock.calls[0][2]).toMatchObject({
      axis: 'y',
      dimension: 'status',
      keys: ['a', 'b'],
    })
    wrapper.unmount()
  })

  it('hides grips when there is a single group', () => {
    const wrapper = mount(IssueListGroups, {
      props: makeProps({ groups: [groups[0]] }),
      global: { stubs },
    })
    expect(wrapper.find('[data-testid="group-grip"]').exists()).toBe(false)
  })

  it('hides grips for ungrouped (none)', () => {
    const wrapper = mount(IssueListGroups, {
      props: makeProps({ groupKey: 'none' }),
      global: { stubs },
    })
    expect(wrapper.find('[data-testid="group-grip"]').exists()).toBe(false)
  })

  it('renders the insertion bar and ghost while dragging', () => {
    const wrapper = mount(IssueListGroups, {
      props: makeProps({
        activeKey: 'b',
        insertIndex: 0,
        barOffset: 40,
        pointer: { x: 20, y: 30 },
      }),
      global: { stubs },
      attachTo: document.body,
    })
    expect(wrapper.find('[data-testid="reorder-bar"]').exists()).toBe(true)
    expect(document.body.querySelector('[data-testid="reorder-ghost"]')?.textContent).toContain('B')
    wrapper.unmount()
  })
})
