import { describe, it, expect } from 'vitest'
import {
  sortIssues,
  groupIssues,
  groupByScope,
  boardColumns,
  boardDropIndex,
  planBoardMove,
  availableScopes,
  labelScopes,
  planRetag,
  applyOrder,
  reorderKeys,
} from './issueView'
import type { IssueGroup } from './issueView'
import type { IssueListItem } from '@/features/issues/composables/useIssues'

// Minimal issue factory — only the fields the view helpers read.
const mk = (
  iid: string,
  title: string,
  labels: { title: string; color: string }[] = [],
  assignees: string[] = [],
  createdAt = '2026-01-01T00:00:00Z',
  status: { name: string; category: string } | null = null,
): IssueListItem =>
  ({
    iid,
    title,
    state: 'opened',
    webUrl: '#',
    createdAt,
    status: status && { id: `st-${status.name}`, color: '#abc', iconName: 'x', ...status },
    labels: { nodes: labels.map((l, i) => ({ id: `${iid}-${i}`, ...l })) },
    assignees: {
      nodes: assignees.map((u) => ({ id: u, username: u, avatarUrl: null })),
    },
  }) as unknown as IssueListItem

const P = (v: string) => ({ title: `priority::${v}`, color: '#fff' })
const S = (v: string) => ({ title: `assigned::${v}`, color: '#0f0' })

describe('sortIssues', () => {
  const issues = [mk('1', 'B', [P('Low')]), mk('2', 'A', [P('High')]), mk('3', 'C', [])]

  it('orders by priority, high first, no-priority last', () => {
    expect(sortIssues(issues, 'priority').map((i) => i.iid)).toEqual(['2', '1', '3'])
  })

  it('orders by title', () => {
    expect(sortIssues(issues, 'title').map((i) => i.title)).toEqual(['A', 'B', 'C'])
  })

  it('keeps server order for updated', () => {
    expect(sortIssues(issues, 'updated').map((i) => i.iid)).toEqual(['1', '2', '3'])
  })

  it('orders by created, newest first', () => {
    const byCreated = [
      mk('1', 'old', [], [], '2026-01-01T00:00:00Z'),
      mk('2', 'new', [], [], '2026-03-01T00:00:00Z'),
      mk('3', 'mid', [], [], '2026-02-01T00:00:00Z'),
    ]
    expect(sortIssues(byCreated, 'created').map((i) => i.iid)).toEqual(['2', '3', '1'])
  })
})

describe('groupIssues', () => {
  const at = '2026-01-01T00:00:00Z'
  const issues = [
    mk('1', 'a', [], [], at, { name: 'In progress', category: 'in_progress' }),
    mk('2', 'b', [], [], at, { name: 'To do', category: 'to_do' }),
    mk('3', 'c'),
  ]

  it('returns a single group when ungrouped', () => {
    const g = groupIssues(issues, 'none')
    expect(g).toHaveLength(1)
    expect(g[0].issues).toHaveLength(3)
  })

  it('orders native status groups by lifecycle category, no-status last', () => {
    expect(groupIssues(issues, 'status').map((g) => g.label)).toEqual([
      'To do',
      'In progress',
      'No status',
    ])
  })

  it('groups by a scoped-label group via label:<scope>', () => {
    const li = [
      mk('1', 'a', [{ title: 'team::HMI', color: '#00f' }]),
      mk('2', 'b', [{ title: 'team::sensors', color: '#0d9488' }]),
      mk('3', 'c', []),
    ]
    expect(groupIssues(li, 'label:team').map((g) => g.label)).toEqual(['HMI', 'sensors', 'No team'])
  })

  it('groups by priority with a canonical order', () => {
    const pi = [mk('1', 'a', [P('Low')]), mk('2', 'b', [P('High')])]
    expect(groupIssues(pi, 'priority').map((g) => g.label)).toEqual([
      'High priority',
      'Low priority',
    ])
  })

  it('groups by assignee, unassigned last', () => {
    const ai = [mk('1', 'a', [], ['zoe']), mk('2', 'b', []), mk('3', 'c', [], ['amy'])]
    expect(groupIssues(ai, 'assignee').map((g) => g.label)).toEqual(['amy', 'zoe', 'Unassigned'])
  })
})

describe('availableScopes', () => {
  it('lists distinct scopes with preferred ones first', () => {
    const issues = [
      mk('1', 'a', [{ title: 'team::HMI', color: '#00f' }, P('High')]),
      mk('2', 'b', [S('in-review'), { title: 'team::HMI', color: '#00f' }]),
    ]
    expect(availableScopes(issues)).toEqual(['assigned', 'priority', 'team'])
  })
})

describe('labelScopes', () => {
  it('reads scopes straight from a label catalog, preferred first', () => {
    const catalog = [
      { id: '1', title: 'team::HMI', color: '#00f' },
      { id: '2', title: 'assigned::stalled', color: '#888' },
      { id: '3', title: 'plain', color: '#111' },
    ]
    expect(labelScopes(catalog)).toEqual(['assigned', 'team'])
  })
})

describe('groupByScope', () => {
  const issues = [
    mk('1', 'a', [{ title: 'team::HMI', color: '#3b82f6' }]),
    mk('2', 'b', [{ title: 'team::sensors', color: '#0d9488' }]),
    mk('3', 'c', []),
  ]

  it('makes a column per value plus a No-scope column last', () => {
    const cols = groupByScope(issues, 'team')
    expect(cols.map((c) => c.label)).toEqual(['HMI', 'sensors', 'No team'])
    expect(cols[0].repLabel).toMatchObject({
      title: 'team::HMI',
      color: '#3b82f6',
    })
    expect(cols[2].repLabel).toBeUndefined()
  })

  it('orders an assigned scope by workflow', () => {
    const wi = [mk('1', 'a', [S('in-review')]), mk('2', 'b', [S('on-deck')])]
    expect(groupByScope(wi, 'assigned').map((c) => c.label)).toEqual(['on-deck', 'in-review'])
  })

  it('seeds empty columns from the label catalog', () => {
    const used = [mk('1', 'a', [{ title: 'assigned::on-deck', color: '#0f0' }])]
    const catalog = [
      { id: 'l1', title: 'assigned::on-deck', color: '#0f0' },
      { id: 'l2', title: 'assigned::in-review', color: '#0f0' },
      { id: 'l3', title: 'assigned::stalled', color: '#888' },
      { id: 'l9', title: 'team::HMI', color: '#00f' },
    ]
    const cols = groupByScope(used, 'assigned', catalog)
    expect(cols.map((c) => c.label)).toEqual(['on-deck', 'in-review', 'stalled'])
    expect(cols.find((c) => c.label === 'in-review')!.issues).toHaveLength(0)
    expect(cols.find((c) => c.label === 'stalled')!.repLabel).toMatchObject({
      id: 'l3',
    })
  })
})

describe('boardColumns', () => {
  const at = '2026-01-01T00:00:00Z'
  // Catalog ids match the factory's `st-${name}` so issues file into seeded columns.
  const status = (name: string, category: string) => ({
    id: `st-${name}`,
    name,
    color: '#abc',
    category,
  })
  const statusCatalog = [
    status('To do', 'to_do'),
    status('In progress', 'in_progress'),
    status('Done', 'done'),
  ]

  it('seeds a status column per catalog entry in order, No status last', () => {
    const issues = [
      mk('1', 'a', [], [], at, { name: 'Done', category: 'done' }),
      mk('2', 'b'),
      mk('3', 'c', [], [], at, { name: 'To do', category: 'to_do' }),
    ]
    const cols = boardColumns(issues, 'status', { statusCatalog })
    expect(cols.map((c) => c.label)).toEqual(['To do', 'In progress', 'Done', 'No status'])
    // Seeded but unused columns are present (drop targets).
    expect(cols.find((c) => c.label === 'In progress')!.issues).toHaveLength(0)
    expect(cols.find((c) => c.label === 'To do')!.issues.map((i) => i.iid)).toEqual(['3'])
  })

  it('groups by assignee, unassigned last', () => {
    const issues = [mk('1', 'a', [], ['zoe']), mk('2', 'b'), mk('3', 'c', [], ['amy'])]
    expect(boardColumns(issues, 'assignee').map((c) => c.label)).toEqual([
      'amy',
      'zoe',
      'Unassigned',
    ])
  })

  it('groups by a label scope, seeding empty columns from the catalog', () => {
    const issues = [mk('1', 'a', [{ title: 'team::HMI', color: '#00f' }]), mk('2', 'b', [])]
    const labelCatalog = [
      { id: 'l1', title: 'team::HMI', color: '#00f' },
      { id: 'l2', title: 'team::sensors', color: '#0d9488' },
    ]
    expect(boardColumns(issues, 'label:team', { labelCatalog }).map((c) => c.label)).toEqual([
      'HMI',
      'sensors',
      'No team',
    ])
  })
})

describe('planBoardMove', () => {
  const at = '2026-01-01T00:00:00Z'
  const col = (key: string, extra: Partial<IssueGroup> = {}): IssueGroup =>
    ({ key, label: key, issues: [], ...extra }) as IssueGroup

  it('plans a status change, ignoring the same and No-status columns', () => {
    const issue = mk('1', 'a', [], [], at, { name: 'To do', category: 'to_do' })
    expect(planBoardMove(issue, 'status', col('st-Done'))).toEqual({
      kind: 'status',
      statusId: 'st-Done',
    })
    expect(planBoardMove(issue, 'status', col('st-To do'))).toBeNull()
    expect(planBoardMove(issue, 'status', col('__none'))).toBeNull()
  })

  it('plans a reassign, clearing assignees for the Unassigned column', () => {
    const issue = mk('1', 'a', [], ['amy'])
    expect(planBoardMove(issue, 'assignee', col('zoe'))).toEqual({
      kind: 'assignee',
      assigneeUsernames: ['zoe'],
    })
    expect(planBoardMove(issue, 'assignee', col('__none'))).toEqual({
      kind: 'assignee',
      assigneeUsernames: [],
    })
    expect(planBoardMove(issue, 'assignee', col('amy'))).toBeNull()
  })

  it('plans a retag for label-scope columns', () => {
    const issue = mk('1', 'a', [{ title: 'team::HMI', color: '#00f' }])
    const target = col('sensors', {
      repLabel: { id: 'x', title: 'team::sensors', color: '#0d9488' },
    })
    expect(planBoardMove(issue, 'label:team', target)).toMatchObject({ kind: 'retag' })
  })
})

describe('boardDropIndex', () => {
  it('drops a recently-updated card at the start', () => {
    const col = [mk('1', 'b'), mk('2', 'c')]
    expect(boardDropIndex(col, mk('9', 'a'), 'updated')).toBe(0)
  })

  it('inserts alphabetically for title sort', () => {
    const col = [mk('1', 'Apple'), mk('2', 'Mango'), mk('3', 'Zebra')]
    expect(boardDropIndex(col, mk('9', 'Lemon'), 'title')).toBe(1)
  })

  it('inserts by priority weight (between high and low)', () => {
    const col = [mk('1', 'a', [P('High')]), mk('2', 'b', [P('Low')])]
    expect(boardDropIndex(col, mk('9', 'x', [P('Medium')]), 'priority')).toBe(1)
  })

  it('inserts by created date, newest first', () => {
    const col = [
      mk('1', 'a', [], [], '2026-03-01T00:00:00Z'),
      mk('2', 'b', [], [], '2026-01-01T00:00:00Z'),
    ]
    expect(boardDropIndex(col, mk('9', 'x', [], [], '2026-02-01T00:00:00Z'), 'created')).toBe(1)
  })
})

describe('planRetag', () => {
  const issue = mk('1', 'a', [
    { title: 'assigned::on-deck', color: '#0f0' },
    { title: 'type::BUG', color: '#f00' },
  ])
  const target = { id: '1-x', title: 'assigned::in-review', color: '#0f0' }

  it('swaps the in-scope label, keeping others', () => {
    const plan = planRetag(issue, 'assigned', target)!
    expect(plan.addLabelIds).toEqual(['1-x'])
    expect(plan.removeLabelIds).toEqual(['1-0'])
    expect(plan.nextLabels.map((l) => l.title)).toEqual(['type::BUG', 'assigned::in-review'])
  })

  it('removes the scope label when dropped on the No-scope column', () => {
    const plan = planRetag(issue, 'assigned', null)!
    expect(plan.addLabelIds).toEqual([])
    expect(plan.removeLabelIds).toEqual(['1-0'])
    expect(plan.nextLabels.map((l) => l.title)).toEqual(['type::BUG'])
  })

  it('returns null when already in the target column', () => {
    const same = { id: '1-0', title: 'assigned::on-deck', color: '#0f0' }
    expect(planRetag(issue, 'assigned', same)).toBeNull()
  })
})

const g = (key: string): IssueGroup => ({ key, label: key, issues: [] })

describe('applyOrder', () => {
  it('returns groups unchanged when order is empty', () => {
    const groups = [g('a'), g('b'), g('c')]
    expect(applyOrder(groups, []).map((x) => x.key)).toEqual(['a', 'b', 'c'])
  })

  it('re-sequences groups to match the given order', () => {
    const groups = [g('a'), g('b'), g('c')]
    expect(applyOrder(groups, ['c', 'a', 'b']).map((x) => x.key)).toEqual(['c', 'a', 'b'])
  })

  it('appends groups absent from the order after, in default order', () => {
    const groups = [g('a'), g('b'), g('c'), g('d')]
    expect(applyOrder(groups, ['c', 'a']).map((x) => x.key)).toEqual(['c', 'a', 'b', 'd'])
  })

  it('ignores order keys with no matching group', () => {
    const groups = [g('a'), g('b')]
    expect(applyOrder(groups, ['z', 'b', 'a']).map((x) => x.key)).toEqual(['b', 'a'])
  })
})

describe('reorderKeys', () => {
  it('moves a key forward to just after its target', () => {
    expect(reorderKeys(['a', 'b', 'c', 'd'], 'a', 'c')).toEqual(['b', 'c', 'a', 'd'])
  })

  it('moves a key backward to just before its target', () => {
    expect(reorderKeys(['a', 'b', 'c', 'd'], 'd', 'b')).toEqual(['a', 'd', 'b', 'c'])
  })

  it('is a no-op when dragging onto itself', () => {
    expect(reorderKeys(['a', 'b', 'c'], 'b', 'b')).toEqual(['a', 'b', 'c'])
  })

  it('returns a copy when a key is missing', () => {
    expect(reorderKeys(['a', 'b'], 'x', 'a')).toEqual(['a', 'b'])
  })
})
