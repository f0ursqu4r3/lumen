import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import IssueBoard from './IssueBoard.vue'
import type { IssueGroup } from '@/features/issues/lib/issueView'

const boardGroups: IssueGroup[] = [
  { key: 'todo', label: 'To do', issues: [] },
  { key: 'doing', label: 'Doing', issues: [] },
]

const baseProps = {
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
  reorderDragKey: null,
  reorderOverKey: null,
}

const stubs = { IssueCard: true }

describe('IssueBoard reorder', () => {
  it('renders a grip per column and emits reorder-start on dragstart', async () => {
    const wrapper = mount(IssueBoard, { props: baseProps, global: { stubs } })
    const grips = wrapper.findAll('[data-testid="column-grip"]')
    expect(grips).toHaveLength(2)
    await grips[1].trigger('dragstart')
    expect(wrapper.emitted('reorder-start')?.[0]?.[0]).toBe('doing')
  })

  it('hides grips when there is a single column', () => {
    const wrapper = mount(IssueBoard, {
      props: { ...baseProps, boardGroups: [boardGroups[0]] },
      global: { stubs },
    })
    expect(wrapper.find('[data-testid="column-grip"]').exists()).toBe(false)
  })
})
