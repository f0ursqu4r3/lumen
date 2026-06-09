import { describe, it, expect } from 'vitest'
import type { IssueDraft } from './issueEdit'
import {
  RAIL_FIELDS,
  railField,
  isFieldVisible,
  visibleFieldKeys,
  hiddenFieldList,
  type RailFieldKey,
} from './railFields'

function makeDraft(over: Partial<IssueDraft> = {}): IssueDraft {
  return {
    title: 'T',
    description: '',
    state: 'opened',
    labelIds: [],
    assigneeUsernames: [],
    milestoneId: null,
    dueDate: '',
    weight: null,
    confidential: false,
    timeEstimate: '',
    statusId: null,
    ...over,
  }
}
const empty = new Set<RailFieldKey>()

describe('railFields registry', () => {
  it('marks status/labels/assignees as pinned and orders fields canonically', () => {
    expect(railField('status').pinned).toBe(true)
    expect(railField('labels').pinned).toBe(true)
    expect(railField('assignees').pinned).toBe(true)
    expect(railField('dueDate').pinned).toBeFalsy()
    const keys = RAIL_FIELDS.map((f) => f.key)
    expect(keys).toEqual([
      'status',
      'labels',
      'assignees',
      'milestone',
      'dueDate',
      'weight',
      'estimate',
      'confidential',
    ])
  })

  it('isPopulated reflects each field value', () => {
    expect(railField('milestone').isPopulated(makeDraft({ milestoneId: 'gid://m/1' }))).toBe(true)
    expect(railField('milestone').isPopulated(makeDraft())).toBe(false)
    expect(railField('dueDate').isPopulated(makeDraft({ dueDate: '2026-06-08' }))).toBe(true)
    expect(railField('dueDate').isPopulated(makeDraft())).toBe(false)
    expect(railField('weight').isPopulated(makeDraft({ weight: 0 }))).toBe(true)
    expect(railField('weight').isPopulated(makeDraft())).toBe(false)
    expect(railField('estimate').isPopulated(makeDraft({ timeEstimate: ' ' }))).toBe(false)
    expect(railField('estimate').isPopulated(makeDraft({ timeEstimate: '2h' }))).toBe(true)
    expect(railField('confidential').isPopulated(makeDraft({ confidential: true }))).toBe(true)
    expect(railField('confidential').isPopulated(makeDraft())).toBe(false)
  })

  it('clear resets each field to empty', () => {
    const d = makeDraft({
      milestoneId: 'gid://m/1',
      dueDate: '2026-06-08',
      weight: 3,
      timeEstimate: '2h',
      confidential: true,
    })
    railField('milestone').clear(d)
    railField('dueDate').clear(d)
    railField('weight').clear(d)
    railField('estimate').clear(d)
    railField('confidential').clear(d)
    expect(d).toMatchObject({
      milestoneId: null,
      dueDate: '',
      weight: null,
      timeEstimate: '',
      confidential: false,
    })
  })
})

describe('visibility derivation', () => {
  const orig = makeDraft()
  it('pins status/labels/assignees even when empty', () => {
    expect(isFieldVisible(railField('status'), makeDraft(), orig, empty, empty)).toBe(true)
    expect(isFieldVisible(railField('labels'), makeDraft(), orig, empty, empty)).toBe(true)
    expect(isFieldVisible(railField('assignees'), makeDraft(), orig, empty, empty)).toBe(true)
  })
  it('hides an empty, unrevealed value field', () => {
    expect(isFieldVisible(railField('dueDate'), makeDraft(), orig, empty, empty)).toBe(false)
  })
  it('shows a value field populated in the draft', () => {
    expect(
      isFieldVisible(
        railField('dueDate'),
        makeDraft({ dueDate: '2026-06-08' }),
        orig,
        empty,
        empty,
      ),
    ).toBe(true)
  })
  it('keeps a field visible when populated in original but cleared in draft (pre-save)', () => {
    const original = makeDraft({ dueDate: '2026-06-08' })
    expect(isFieldVisible(railField('dueDate'), makeDraft(), original, empty, empty)).toBe(true)
  })
  it('shows a revealed empty field, and hides it once removed', () => {
    const revealed = new Set<RailFieldKey>(['dueDate'])
    expect(isFieldVisible(railField('dueDate'), makeDraft(), orig, revealed, empty)).toBe(true)
    const removed = new Set<RailFieldKey>(['dueDate'])
    const original = makeDraft({ dueDate: '2026-06-08' })
    expect(isFieldVisible(railField('dueDate'), makeDraft(), original, empty, removed)).toBe(false)
  })
  it('visibleFieldKeys keeps canonical order and excludes hidden', () => {
    const d = makeDraft({ dueDate: '2026-06-08' })
    expect([...visibleFieldKeys(d, orig, empty, empty)]).toEqual([
      'status',
      'labels',
      'assignees',
      'dueDate',
    ])
  })
  it('hiddenFieldList excludes pinned and visible, in canonical order', () => {
    const d = makeDraft({ dueDate: '2026-06-08' })
    expect(hiddenFieldList(d, orig, empty, empty).map((f) => f.key)).toEqual([
      'milestone',
      'weight',
      'estimate',
      'confidential',
    ])
  })
})
