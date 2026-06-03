import { describe, it, expect } from 'vitest'
import { groupLabelsByScope, toggleScoped } from './labelGroups'

const labels = [
  { id: 'l1', title: 'bug', color: '#f00' },
  { id: 'l2', title: 'priority::high', color: '#fa0' },
  { id: 'l3', title: 'priority::low', color: '#0a0' },
  { id: 'l4', title: 'type::bug', color: '#00f' },
]

describe('groupLabelsByScope', () => {
  it('groups by scope, preferred scopes first, Other last', () => {
    const groups = groupLabelsByScope(labels)
    expect(groups.map((g) => g.key)).toEqual(['priority', 'type', '__none'])
    expect(groups.at(-1)!.label).toBe('Other')
  })

  it('carries the parsed value and members per group', () => {
    const groups = groupLabelsByScope(labels)
    const priority = groups.find((g) => g.key === 'priority')!
    expect(priority.label).toBe('priority')
    expect(priority.options.map((o) => o.value)).toEqual(['high', 'low'])
    const other = groups.find((g) => g.key === '__none')!
    expect(other.options.map((o) => o.title)).toEqual(['bug'])
    expect(other.options[0].value).toBe('bug')
  })

  it('returns an empty array for no labels', () => {
    expect(groupLabelsByScope([])).toEqual([])
  })
})

describe('toggleScoped', () => {
  it('adds an unscoped label without touching others', () => {
    expect(toggleScoped(['a'], 'bug')).toEqual(['a', 'bug'])
  })

  it('removes a label that is already selected', () => {
    expect(toggleScoped(['bug', 'x'], 'bug')).toEqual(['x'])
  })

  it('replaces another value in the same scope (exclusivity)', () => {
    expect(toggleScoped(['priority::low', 'type::bug'], 'priority::high')).toEqual([
      'type::bug',
      'priority::high',
    ])
  })

  it('toggles a scoped label off when re-selected', () => {
    expect(toggleScoped(['priority::high'], 'priority::high')).toEqual([])
  })
})
