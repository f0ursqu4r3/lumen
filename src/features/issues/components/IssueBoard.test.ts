import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import IssueBoard from './IssueBoard.vue'
import type { IssueGroup } from '@/features/issues/lib/issueView'

const boardGroups: IssueGroup[] = [
  { key: 'todo', label: 'To do', issues: [] },
  { key: 'doing', label: 'Doing', color: '#3b82f6', issues: [] },
]

function makeProps(over: Record<string, unknown> = {}) {
  return {
    boardGroups,
    fullPath: 'grp/proj',
    highlightIid: null,
    selectMode: false,
    draggingIid: null,
    justDropped: null,
    dragging: null,
    vtNameFor: () => undefined,
    isDropTarget: () => false,
    ghostIndex: () => 0,
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
const stubs = { IssueCard: true }

afterEach(() => {
  document.querySelectorAll('[data-testid="reorder-ghost"]').forEach((n) => n.remove())
})

describe('IssueBoard reorder', () => {
  it('starts a reorder on grip pointerdown', async () => {
    const start = vi.fn()
    const wrapper = mount(IssueBoard, {
      props: makeProps({ start }),
      global: { stubs },
      attachTo: document.body,
    })
    const grips = wrapper.findAll('[data-testid="column-grip"]')
    expect(grips).toHaveLength(2)
    await grips[1].trigger('pointerdown')
    expect(start).toHaveBeenCalledTimes(1)
    expect(start.mock.calls[0][0]).toBe('doing')
    expect(start.mock.calls[0][2]).toMatchObject({
      axis: 'x',
      dimension: 'status',
      keys: ['todo', 'doing'],
    })
    wrapper.unmount()
  })

  it('hides grips when there is a single column', () => {
    const wrapper = mount(IssueBoard, {
      props: makeProps({ boardGroups: [boardGroups[0]] }),
      global: { stubs },
    })
    expect(wrapper.find('[data-testid="column-grip"]').exists()).toBe(false)
  })

  it('renders the insertion bar and ghost while dragging', () => {
    const wrapper = mount(IssueBoard, {
      props: makeProps({
        activeKey: 'doing',
        insertIndex: 0,
        barOffset: 120,
        pointer: { x: 50, y: 60 },
      }),
      global: { stubs },
      attachTo: document.body,
    })
    expect(wrapper.find('[data-testid="reorder-bar"]').exists()).toBe(true)
    const g = document.body.querySelector('[data-testid="reorder-ghost"]')
    expect(g?.textContent).toContain('Doing')
    wrapper.unmount()
  })

  it('shows no bar when idle', () => {
    const wrapper = mount(IssueBoard, { props: makeProps(), global: { stubs } })
    expect(wrapper.find('[data-testid="reorder-bar"]').exists()).toBe(false)
  })
})
