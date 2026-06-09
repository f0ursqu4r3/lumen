export type MrState = 'opened' | 'merged' | 'closed' | 'all'
export type MrSortKey = 'updated' | 'created' | 'merged'
export type MrDraft = 'any' | 'draft' | 'ready'

// URL keys that make up the persisted, per-project MR view-state slice.
export const MR_FILTER_KEYS = [
  'state',
  'label',
  'author',
  'assignee',
  'reviewer',
  'milestone',
  'draft',
  'sort',
  'q',
] as const

export const MR_SORT_OPTIONS: { key: MrSortKey; label: string }[] = [
  { key: 'updated', label: 'Last updated' },
  { key: 'created', label: 'Created' },
  { key: 'merged', label: 'Merged' },
]

const SORT_ARG: Record<MrSortKey, string> = {
  updated: 'updated_desc',
  created: 'created_desc',
  merged: 'merged_at_desc',
}

/** Normalized filter inputs the composable exposes. */
export type MrFilters = {
  state: MrState
  labels: string[]
  author?: string
  assignee?: string
  reviewer?: string
  milestone?: string
  draft: MrDraft
  sort: MrSortKey
  search?: string
}

/** GraphQL variables for the list query (minus fullPath/after/search). */
export type MrQueryVars = {
  state?: Exclude<MrState, 'all'>
  sort: string
  authorUsername?: string
  assigneeUsername?: string
  reviewerUsername?: string
  labelName?: string[]
  milestoneTitle?: string
  draft?: boolean
}

export function toMrVars(f: MrFilters): MrQueryVars {
  return {
    state: f.state === 'all' ? undefined : f.state,
    sort: SORT_ARG[f.sort],
    authorUsername: f.author || undefined,
    assigneeUsername: f.assignee || undefined,
    reviewerUsername: f.reviewer || undefined,
    labelName: f.labels.length ? f.labels : undefined,
    milestoneTitle: f.milestone || undefined,
    draft: f.draft === 'any' ? undefined : f.draft === 'draft',
  }
}

/** Display state for an MR: draft takes precedence over open. */
export function mrStateLabel(mr: {
  state: string
  draft: boolean
}): 'draft' | 'open' | 'merged' | 'closed' {
  if (mr.state === 'merged') return 'merged'
  if (mr.state === 'closed' || mr.state === 'locked') return 'closed'
  return mr.draft ? 'draft' : 'open'
}

/** vue-query keys for the MR list and a single MR. */
export const mrListKey = (fullPath: string, vars: unknown) =>
  ['merge-requests', fullPath, vars] as const
export const mrKey = (fullPath: string, iid: string) => ['merge-request', fullPath, iid] as const

export const MR_POLL_MS = 30_000
