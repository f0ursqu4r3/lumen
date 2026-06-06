import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import IssueListGroups from './IssueListGroups.vue'
import type { IssueGroup } from '@/features/issues/lib/issueView'

const groups: IssueGroup[] = [
  { key: 'a', label: 'A', issues: [] },
  { key: 'b', label: 'B', issues: [] },
]

const baseProps = {
  groups,
  groupKey: 'status',
  fullPath: 'grp/proj',
  highlightIid: null,
  vtNameFor: () => undefined,
  reorderDragKey: null,
  reorderOverKey: null,
}

const stubs = { IssueRow: true, Card: true }

describe('IssueListGroups reorder', () => {
  it('renders a grip per group and emits reorder-start on dragstart', async () => {
    const wrapper = mount(IssueListGroups, { props: baseProps, global: { stubs } })
    const grips = wrapper.findAll('[data-testid="group-grip"]')
    expect(grips).toHaveLength(2)
    await grips[0].trigger('dragstart')
    expect(wrapper.emitted('reorder-start')?.[0]?.[0]).toBe('a')
  })

  it('hides grips when there is a single group', () => {
    const wrapper = mount(IssueListGroups, {
      props: { ...baseProps, groups: [groups[0]] },
      global: { stubs },
    })
    expect(wrapper.find('[data-testid="group-grip"]').exists()).toBe(false)
  })

  it('hides headers and grips for ungrouped (none)', () => {
    const wrapper = mount(IssueListGroups, {
      props: { ...baseProps, groupKey: 'none' },
      global: { stubs },
    })
    expect(wrapper.find('[data-testid="group-grip"]').exists()).toBe(false)
  })
})
