// Client-side sort + grouping for the issue workspace. We do this on the loaded
// set (the list infinitely-loads every page) rather than server-side, because
// priority and workflow status live in scoped labels — GitLab can't sort or
// group by them, but we can. Pure functions, easy to test.
import type { IssueListItem } from '@/features/issues/composables/useIssues'
import { priorityOf, parseLabel } from '@/features/labels/lib/labels'

export interface LabelNode {
  id: string
  title: string
  color: string
}

export type SortKey = 'priority' | 'title' | 'updated' | 'created'
// `label:<scope>` groups by a scoped-label group (team::, type::, …), reusing the
// board's groupByScope. The fixed keys cover the native/derived facets.
export type GroupKey = 'none' | 'status' | 'priority' | 'assignee' | `label:${string}`

export const SORTS: { value: SortKey; label: string }[] = [
  { value: 'updated', label: 'Recently updated' },
  { value: 'priority', label: 'Priority' },
  { value: 'title', label: 'Title' },
  { value: 'created', label: 'Recently created' },
]

export const GROUPS: { value: GroupKey; label: string }[] = [
  { value: 'none', label: 'No grouping' },
  { value: 'status', label: 'Status' },
  { value: 'assignee', label: 'Assignee' },
]

const labelsOf = (i: IssueListItem) =>
  i.labels?.nodes?.filter((l): l is NonNullable<typeof l> => !!l) ?? []

const firstAssignee = (i: IssueListItem) =>
  i.assignees?.nodes?.filter((a): a is NonNullable<typeof a> => !!a)[0] ?? null

/** Stable sort by the chosen key. `updated` keeps the server's UPDATED_DESC order. */
export function sortIssues(issues: readonly IssueListItem[], key: SortKey): IssueListItem[] {
  const arr = [...issues]
  if (key === 'title') return arr.sort((a, b) => a.title.localeCompare(b.title))
  if (key === 'priority') {
    const rank = (i: IssueListItem) => priorityOf(labelsOf(i))?.weight ?? 0
    // Higher weight first; ties keep incoming (updated) order via index fallback.
    return arr
      .map((issue, i) => ({ issue, i }))
      .sort((a, b) => rank(b.issue) - rank(a.issue) || a.i - b.i)
      .map((x) => x.issue)
  }
  if (key === 'created') {
    return arr.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }
  return arr
}

export interface IssueGroup {
  key: string
  label: string
  /** Optional accent color (status/priority groups). */
  color?: string
  /** Representative label for the column's value — the drop target when retagging. */
  repLabel?: LabelNode
  issues: IssueListItem[]
}

// Preferred left-to-right / top-to-bottom ordering for known workflow statuses
// (board columns built from scoped labels).
const STATUS_ORDER = ['on-deck', 'blocked', 'in-progress', 'in-review', 'done']
const statusRank = (value: string) => {
  const i = STATUS_ORDER.indexOf(value.toLowerCase())
  return i === -1 ? STATUS_ORDER.length : i
}

// Lifecycle order for the native work-item Status category, used to sort the
// status groups. GitLab serializes the category lowercased (to_do, in_progress,
// …); normalize so it ranks regardless of casing.
const CATEGORY_ORDER = ['triage', 'to_do', 'in_progress', 'done', 'canceled']
const categoryRank = (category?: string | null) => {
  const i = CATEGORY_ORDER.indexOf((category ?? '').toLowerCase())
  return i === -1 ? CATEGORY_ORDER.length : i
}

// Groups by the issue's native work-item Status (To do / In progress / Done / …),
// ordered by lifecycle category. Issues without a status fall into a trailing
// "No status" group.
function groupByStatus(issues: readonly IssueListItem[]): IssueGroup[] {
  const map = new Map<string, IssueGroup>()
  const category = new Map<string, string>()
  for (const issue of issues) {
    const s = issue.status ?? null
    const key = s?.id ?? '__none'
    if (!map.has(key)) {
      map.set(key, { key, label: s?.name ?? 'No status', color: s?.color ?? undefined, issues: [] })
      category.set(key, (s?.category ?? '').toLowerCase())
    }
    map.get(key)!.issues.push(issue)
  }
  return [...map.values()].sort((a, b) => {
    if (a.key === '__none') return 1
    if (b.key === '__none') return -1
    return (
      categoryRank(category.get(a.key)) - categoryRank(category.get(b.key)) ||
      a.label.localeCompare(b.label)
    )
  })
}

function groupByPriority(issues: readonly IssueListItem[]): IssueGroup[] {
  const order = ['critical', 'fasttrack', 'high', 'medium', 'low', '__none']
  const map = new Map<string, IssueGroup>()
  for (const issue of issues) {
    const p = priorityOf(labelsOf(issue))
    const key = p ? p.level : '__none'
    if (!map.has(key))
      map.set(key, {
        key,
        label: p ? p.label : 'No priority',
        color: p?.color,
        issues: [],
      })
    map.get(key)!.issues.push(issue)
  }
  return [...map.values()].sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key))
}

function groupByAssignee(issues: readonly IssueListItem[]): IssueGroup[] {
  const map = new Map<string, IssueGroup>()
  for (const issue of issues) {
    const a = firstAssignee(issue)
    const key = a ? a.username : '__none'
    if (!map.has(key)) map.set(key, { key, label: a ? a.username : 'Unassigned', issues: [] })
    map.get(key)!.issues.push(issue)
  }
  return [...map.values()].sort((a, b) => {
    if (a.key === '__none') return 1
    if (b.key === '__none') return -1
    return a.label.localeCompare(b.label)
  })
}

export function groupIssues(issues: readonly IssueListItem[], key: GroupKey): IssueGroup[] {
  // `label:<scope>` reuses the board grouping — no catalog, so only scopes the
  // loaded issues actually use produce groups (no empty columns in the list).
  if (key.startsWith('label:')) return groupByScope(issues, key.slice('label:'.length))
  switch (key) {
    case 'status':
      return groupByStatus(issues)
    case 'priority':
      return groupByPriority(issues)
    case 'assignee':
      return groupByAssignee(issues)
    default:
      return [{ key: 'all', label: '', issues: [...issues] }]
  }
}

// --- board: group by any scoped-label group --------------------------------

const scopeOf = (l: LabelNode) => parseLabel(l.title, l.color).scope?.toLowerCase() ?? null
const valueOf = (l: LabelNode) => parseLabel(l.title, l.color).value

/** Distinct label scopes in a label set, preferred ones first. */
export function labelScopes(labels: readonly LabelNode[]): string[] {
  const set = new Set<string>()
  for (const l of labels) {
    const s = scopeOf(l)
    if (s) set.add(s)
  }
  const preferred = ['assigned', 'priority', 'team', 'type']
  return [...set].sort((a, b) => {
    const ia = preferred.indexOf(a)
    const ib = preferred.indexOf(b)
    if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib)
    return a.localeCompare(b)
  })
}

/** Distinct label scopes present across the issues, preferred ones first. */
export function availableScopes(issues: readonly IssueListItem[]): string[] {
  return labelScopes(issues.flatMap((i) => labelsOf(i)))
}

const priorityRank = (label: string) =>
  ['critical', 'fasttrack', 'high', 'medium', 'low'].indexOf(
    label
      .toLowerCase()
      .replace(' priority', '')
      .replace(/[\s_-]/g, ''),
  )

/**
 * Columns for the board: one per distinct value of `scope`, plus a "No …" column.
 * When `catalog` (all project labels) is given, every label in the scope gets a
 * column even if no loaded issue uses it yet — so empty columns are draggable into.
 */
export function groupByScope(
  issues: readonly IssueListItem[],
  scope: string,
  catalog?: readonly LabelNode[],
): IssueGroup[] {
  const s = scope.toLowerCase()
  const map = new Map<string, IssueGroup>()
  // Seed empty columns from the full label catalog first.
  if (catalog)
    for (const l of catalog) {
      if (scopeOf(l) !== s) continue
      const value = valueOf(l)
      if (!map.has(value))
        map.set(value, {
          key: value,
          label: value,
          color: l.color,
          repLabel: { id: l.id, title: l.title, color: l.color },
          issues: [],
        })
    }
  for (const issue of issues) {
    const match = labelsOf(issue).find((l) => scopeOf(l) === s)
    const value = match ? valueOf(match) : null
    const key = value ?? '__none'
    if (!map.has(key))
      map.set(key, {
        key,
        label: value ?? `No ${scope}`,
        color: match?.color,
        repLabel: match ? { id: match.id, title: match.title, color: match.color } : undefined,
        issues: [],
      })
    map.get(key)!.issues.push(issue)
  }
  const known =
    s === 'assigned' || s === 'workflow' || s === 'status'
      ? (a: IssueGroup, b: IssueGroup) => statusRank(a.label) - statusRank(b.label)
      : s === 'priority'
        ? (a: IssueGroup, b: IssueGroup) => priorityRank(a.label) - priorityRank(b.label)
        : (a: IssueGroup, b: IssueGroup) => a.label.localeCompare(b.label)
  return [...map.values()].sort((a, b) => {
    if (a.key === '__none') return 1
    if (b.key === '__none') return -1
    return known(a, b)
  })
}

/** Minimal native-status shape the board needs to seed and order columns. */
export interface StatusOption {
  id: string
  name: string
  color: string
  category?: string | null
}

/**
 * Board columns by native work-item Status. Seeds a column for every status in
 * `catalog` (so empty lifecycle columns exist as drop targets) in the catalog's
 * order, then files issues into them; unknown statuses fall back to category
 * order and "No status" trails. The column key is the status id — the drop
 * target a card is dragged onto.
 */
function columnsByStatus(
  issues: readonly IssueListItem[],
  catalog?: readonly StatusOption[],
): IssueGroup[] {
  const map = new Map<string, IssueGroup>()
  const category = new Map<string, string>()
  const order = new Map<string, number>()
  if (catalog)
    catalog.forEach((s, i) => {
      order.set(s.id, i)
      map.set(s.id, { key: s.id, label: s.name, color: s.color, issues: [] })
      category.set(s.id, (s.category ?? '').toLowerCase())
    })
  for (const issue of issues) {
    const s = issue.status ?? null
    const key = s?.id ?? '__none'
    if (!map.has(key)) {
      map.set(key, { key, label: s?.name ?? 'No status', color: s?.color ?? undefined, issues: [] })
      category.set(key, (s?.category ?? '').toLowerCase())
    }
    map.get(key)!.issues.push(issue)
  }
  // Catalog order wins; statuses outside it sort after by lifecycle category.
  const rank = (key: string) => order.get(key) ?? 1000 + categoryRank(category.get(key))
  return [...map.values()].sort((a, b) => {
    if (a.key === '__none') return 1
    if (b.key === '__none') return -1
    return rank(a.key) - rank(b.key) || a.label.localeCompare(b.label)
  })
}

/**
 * Columns for the board for any grouping key — native Status, Assignee, or a
 * `label:<scope>` group. Mirrors the list's groupIssues, but seeds empty columns
 * (from the status/label catalogs) so the board always has drop targets.
 */
export function boardColumns(
  issues: readonly IssueListItem[],
  key: GroupKey,
  opts: { labelCatalog?: readonly LabelNode[]; statusCatalog?: readonly StatusOption[] } = {},
): IssueGroup[] {
  if (key === 'status') return columnsByStatus(issues, opts.statusCatalog)
  if (key === 'assignee') return groupByAssignee(issues)
  if (key.startsWith('label:'))
    return groupByScope(issues, key.slice('label:'.length), opts.labelCatalog)
  // 'none'/'priority' have no board column model; show everything in one lane.
  return [{ key: 'all', label: '', issues: [...issues] }]
}

/** The grouping keys the board can render as columns (drag-editable). */
export const BOARD_GROUPS: { value: GroupKey; label: string }[] = [
  { value: 'status', label: 'Status' },
  { value: 'assignee', label: 'Assignee' },
]

/**
 * Plan a drag-to-retag: move `issue` into the column whose label is `target`
 * (or out of the scope entirely when `target` is null). Returns the label id
 * deltas and the optimistic next-labels, or null when it's already there.
 * GitLab enforces scoped-label exclusivity, but we remove the old id too so the
 * optimistic cache update is correct immediately.
 */
export function planRetag(
  issue: IssueListItem,
  scope: string,
  target: LabelNode | null,
): {
  addLabelIds: string[]
  removeLabelIds: string[]
  nextLabels: LabelNode[]
} | null {
  const s = scope.toLowerCase()
  const labs: LabelNode[] = labelsOf(issue).map((l) => ({
    id: l.id,
    title: l.title,
    color: l.color,
  }))
  const current = labs.find((l) => scopeOf(l) === s) ?? null
  if ((target && current && current.id === target.id) || (!target && !current)) return null
  return {
    removeLabelIds: current ? [current.id] : [],
    addLabelIds: target ? [target.id] : [],
    nextLabels: [...labs.filter((l) => l.id !== current?.id), ...(target ? [target] : [])],
  }
}

/** A planned board drag, discriminated by which mutation carries it out. */
export type BoardMove =
  | { kind: 'retag'; addLabelIds: string[]; removeLabelIds: string[]; nextLabels: LabelNode[] }
  | { kind: 'status'; statusId: string }
  | { kind: 'assignee'; assigneeUsernames: string[] }

/**
 * Plan dropping `issue` into `column` while the board is grouped by `key`.
 * Returns the move to run (label retag / status set / reassign) or null when it
 * wouldn't change anything — or when the target can't be set (the "No status"
 * column, since the status widget can't be cleared by a drop). Assignee/label
 * "none" columns ARE valid targets: they clear the assignee / scoped label.
 */
export function planBoardMove(
  issue: IssueListItem,
  key: GroupKey,
  column: IssueGroup,
): BoardMove | null {
  if (key === 'status') {
    if (column.key === '__none') return null
    if ((issue.status?.id ?? null) === column.key) return null
    return { kind: 'status', statusId: column.key }
  }
  if (key === 'assignee') {
    const target = column.key === '__none' ? null : column.key
    if ((firstAssignee(issue)?.username ?? null) === target) return null
    return { kind: 'assignee', assigneeUsernames: target ? [target] : [] }
  }
  if (key.startsWith('label:')) {
    const plan = planRetag(issue, key.slice('label:'.length), column.repLabel ?? null)
    return plan ? { kind: 'retag', ...plan } : null
  }
  return null
}

/**
 * The index at which `issue` will land in `columnIssues` once dropped, given the
 * active sort — so the board ghost can preview its real resting place rather than
 * sit at the bottom. 'updated' orders by server UPDATED_DESC and a drop bumps the
 * issue's updatedAt, so it always lands at the start (index 0); the other keys
 * insert by their comparator, after any ties (mirroring sortIssues' stability).
 */
export function boardDropIndex(
  columnIssues: readonly IssueListItem[],
  issue: IssueListItem,
  key: SortKey,
): number {
  if (key === 'updated') return 0
  const weight = (i: IssueListItem) => priorityOf(labelsOf(i))?.weight ?? 0
  const time = (i: IssueListItem) => new Date(i.createdAt).getTime()
  // Negative ⇒ `a` sorts before `b`, matching sortIssues' order for `key`.
  const before = (a: IssueListItem, b: IssueListItem) =>
    key === 'title'
      ? a.title.localeCompare(b.title)
      : key === 'priority'
        ? weight(b) - weight(a)
        : time(b) - time(a) // 'created': newest first
  let i = 0
  while (i < columnIssues.length && before(columnIssues[i], issue) <= 0) i++
  return i
}

/**
 * Re-sequence groups by a stored key order without losing any. Groups whose
 * `key` is in `order` come first, in that sequence; groups absent from `order`
 * keep their default relative order and append after (so a newly-appeared
 * status/label column lands at the end). Order keys with no matching group are
 * ignored. Stable; pure.
 */
export function applyOrder(groups: IssueGroup[], order: readonly string[]): IssueGroup[] {
  if (!order.length) return [...groups]
  const rank = new Map(order.map((k, i) => [k, i] as const))
  return groups
    .map((group, i) => ({ group, i }))
    .sort((a, b) => {
      const ra = rank.get(a.group.key)
      const rb = rank.get(b.group.key)
      if (ra != null && rb != null) return ra - rb
      if (ra != null) return -1
      if (rb != null) return 1
      return a.i - b.i
    })
    .map((x) => x.group)
}

/**
 * Move `key` to `index` within `keys` (index is in the array with `key`
 * removed; clamped to a valid slot). Used by the pointer-driven reorder, which
 * thinks in terms of a landing index rather than an over-key. Pure — returns a
 * fresh array.
 */
export function reorderToIndex(keys: readonly string[], key: string, index: number): string[] {
  const without = keys.filter((k) => k !== key)
  const clamped = Math.max(0, Math.min(index, without.length))
  without.splice(clamped, 0, key)
  return without
}

// --- active filters ---------------------------------------------------------

/**
 * Every clickable facet reduces to either a label filter or an assignee filter,
 * so the server query (labelName / assigneeUsernames) needs no new variables.
 */
export type Facet =
  | { kind: 'label'; value: string; color: string }
  | { kind: 'assignee'; value: string }
