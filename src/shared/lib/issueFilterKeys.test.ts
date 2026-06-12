import { describe, it, expect } from 'vitest'
import { FILTER_KEYS } from './issueFilterKeys'

describe('FILTER_KEYS', () => {
  it('lists the issues-list view keys in order', () => {
    expect(FILTER_KEYS).toEqual([
      'state',
      'label',
      'assignee',
      'author',
      'q',
      'sort',
      'group',
      'view',
      'scope',
    ])
  })
})
