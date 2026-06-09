import { describe, it, expect } from 'vitest'
import { toMrVars, mrStateLabel, MR_FILTER_KEYS, MR_SORT_OPTIONS, type MrFilters } from './mrView'

const base: MrFilters = {
  state: 'opened',
  labels: [],
  draft: 'any',
  sort: 'updated',
}

describe('MR_FILTER_KEYS', () => {
  it('lists the recognized filter keys', () => {
    expect(MR_FILTER_KEYS).toEqual([
      'state',
      'label',
      'author',
      'assignee',
      'reviewer',
      'milestone',
      'draft',
      'sort',
      'q',
    ])
  })
})

describe('toMrVars', () => {
  it('maps the default slice (opened, updated) to args', () => {
    expect(toMrVars(base)).toEqual({
      state: 'opened',
      sort: 'updated_desc',
      authorUsername: undefined,
      assigneeUsername: undefined,
      reviewerUsername: undefined,
      labelName: undefined,
      milestoneTitle: undefined,
      draft: undefined,
    })
  })
  it("omits state when 'all'", () => {
    expect(toMrVars({ ...base, state: 'all' }).state).toBeUndefined()
  })
  it('maps the draft tri-state to a boolean or undefined', () => {
    expect(toMrVars({ ...base, draft: 'draft' }).draft).toBe(true)
    expect(toMrVars({ ...base, draft: 'ready' }).draft).toBe(false)
    expect(toMrVars({ ...base, draft: 'any' }).draft).toBeUndefined()
  })
  it('passes usernames, labels, milestone, and sort through', () => {
    const v = toMrVars({
      ...base,
      author: 'ada',
      assignee: 'lin',
      reviewer: 'ray',
      labels: ['bug', 'ui'],
      milestone: 'v1',
      sort: 'merged',
    })
    expect(v).toMatchObject({
      authorUsername: 'ada',
      assigneeUsername: 'lin',
      reviewerUsername: 'ray',
      labelName: ['bug', 'ui'],
      milestoneTitle: 'v1',
      sort: 'merged_at_desc',
    })
  })
  it('maps the created sort key', () => {
    expect(toMrVars({ ...base, sort: 'created' }).sort).toBe('created_desc')
  })
})

describe('mrStateLabel', () => {
  it('prefers draft over open for an open draft MR', () => {
    expect(mrStateLabel({ state: 'opened', draft: true })).toBe('draft')
    expect(mrStateLabel({ state: 'opened', draft: false })).toBe('open')
  })
  it('maps merged and closed/locked', () => {
    expect(mrStateLabel({ state: 'merged', draft: false })).toBe('merged')
    expect(mrStateLabel({ state: 'closed', draft: false })).toBe('closed')
    expect(mrStateLabel({ state: 'locked', draft: false })).toBe('closed')
  })
  it('does not let a stale draft flag override merged/closed', () => {
    expect(mrStateLabel({ state: 'merged', draft: true })).toBe('merged')
    expect(mrStateLabel({ state: 'closed', draft: true })).toBe('closed')
  })
})

describe('MR_SORT_OPTIONS', () => {
  it('exposes the three sort keys with labels', () => {
    expect(MR_SORT_OPTIONS.map((o) => o.key)).toEqual(['updated', 'created', 'merged'])
    expect(MR_SORT_OPTIONS.map((o) => o.label)).toEqual(['Last updated', 'Created', 'Merged'])
  })
})
