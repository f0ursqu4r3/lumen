import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'
import GroupSelectCheckbox from './GroupSelectCheckbox.vue'
import {
  IssueSelectionKey,
  useIssueSelection,
} from '@/features/issues/composables/useIssueSelection'

const mountBox = (iids: string[], setup?: (s: ReturnType<typeof useIssueSelection>) => void) => {
  const selection = useIssueSelection(ref('grp/proj'))
  setup?.(selection)
  const w = mount(GroupSelectCheckbox, {
    props: { iids, label: 'Critical' },
    global: { provide: { [IssueSelectionKey as symbol]: selection } },
  })
  return { w, selection }
}

const state = (w: ReturnType<typeof mount>) =>
  w.get('[data-testid="group-select-all"]').attributes('data-state')

describe('GroupSelectCheckbox', () => {
  it('renders nothing when select mode is off', () => {
    const { w } = mountBox(['1', '2'])
    expect(w.find('[data-testid="group-select-all"]').exists()).toBe(false)
  })

  it('is unchecked when no group member is selected', () => {
    const { w } = mountBox(['1', '2'], (s) => s.setMode(true))
    expect(state(w)).toBe('unchecked')
  })

  it('is indeterminate when only some are selected', () => {
    const { w } = mountBox(['1', '2'], (s) => {
      s.setMode(true)
      s.toggle('1')
    })
    expect(state(w)).toBe('indeterminate')
  })

  it('is checked when every member is selected', () => {
    const { w } = mountBox(['1', '2'], (s) => {
      s.setMode(true)
      s.setMany(['1', '2'], true)
    })
    expect(state(w)).toBe('checked')
  })

  it('selects the whole group when clicked from empty', async () => {
    const { w, selection } = mountBox(['1', '2'], (s) => s.setMode(true))
    await w.get('[data-testid="group-select-all"]').trigger('click')
    expect([...selection.selected.value].sort()).toEqual(['1', '2'])
  })

  it('clears the group when clicked while fully selected', async () => {
    const { w, selection } = mountBox(['1', '2'], (s) => {
      s.setMode(true)
      s.setMany(['1', '2'], true)
    })
    await w.get('[data-testid="group-select-all"]').trigger('click')
    expect(selection.count.value).toBe(0)
  })

  it('selects the remaining group members when partially selected', async () => {
    const { w, selection } = mountBox(['1', '2'], (s) => {
      s.setMode(true)
      s.toggle('1')
    })
    await w.get('[data-testid="group-select-all"]').trigger('click')
    expect([...selection.selected.value].sort()).toEqual(['1', '2'])
  })
})
