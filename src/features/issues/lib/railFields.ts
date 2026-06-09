import type { IssueDraft } from '@/features/issues/lib/issueEdit'

export type RailFieldKey =
  | 'status'
  | 'labels'
  | 'assignees'
  | 'milestone'
  | 'dueDate'
  | 'weight'
  | 'estimate'
  | 'confidential'

export interface RailFieldDescriptor {
  key: RailFieldKey
  label: string
  /** Menu label override, e.g. "Mark confidential". Falls back to `label`. */
  addLabel?: string
  /** Pinned fields always render and never appear in the Add menu. */
  pinned?: boolean
  isPopulated: (d: IssueDraft) => boolean
  /** The × action: reset this field to its empty value. */
  clear: (d: IssueDraft) => void
}

// Canonical order — drives both the rendered sequence and the Add menu.
export const RAIL_FIELDS: RailFieldDescriptor[] = [
  { key: 'status', label: 'Status', pinned: true, isPopulated: () => true, clear: () => {} },
  {
    key: 'labels',
    label: 'Labels',
    pinned: true,
    isPopulated: (d) => d.labelIds.length > 0,
    clear: (d) => {
      d.labelIds = []
    },
  },
  {
    key: 'assignees',
    label: 'Assignees',
    pinned: true,
    isPopulated: (d) => d.assigneeUsernames.length > 0,
    clear: (d) => {
      d.assigneeUsernames = []
    },
  },
  {
    key: 'milestone',
    label: 'Milestone',
    isPopulated: (d) => d.milestoneId != null,
    clear: (d) => {
      d.milestoneId = null
    },
  },
  {
    key: 'dueDate',
    label: 'Due date',
    isPopulated: (d) => d.dueDate !== '',
    clear: (d) => {
      d.dueDate = ''
    },
  },
  {
    key: 'weight',
    label: 'Weight',
    isPopulated: (d) => d.weight != null,
    clear: (d) => {
      d.weight = null
    },
  },
  {
    key: 'estimate',
    label: 'Estimate',
    isPopulated: (d) => d.timeEstimate.trim() !== '',
    clear: (d) => {
      d.timeEstimate = ''
    },
  },
  {
    key: 'confidential',
    label: 'Confidential',
    addLabel: 'Mark confidential',
    isPopulated: (d) => d.confidential === true,
    clear: (d) => {
      d.confidential = false
    },
  },
]

const BY_KEY = new Map<RailFieldKey, RailFieldDescriptor>(RAIL_FIELDS.map((f) => [f.key, f]))

export function railField(key: RailFieldKey): RailFieldDescriptor {
  const f = BY_KEY.get(key)
  if (!f) throw new Error(`Unknown rail field: ${key}`)
  return f
}

/**
 * A field is visible when pinned, or — unless explicitly removed this session —
 * when revealed this session, populated in the draft, or populated in the
 * last-synced original (so clearing a value keeps the field editable until save).
 */
export function isFieldVisible(
  desc: RailFieldDescriptor,
  draft: IssueDraft,
  original: IssueDraft,
  revealed: ReadonlySet<RailFieldKey>,
  removed: ReadonlySet<RailFieldKey>,
): boolean {
  if (desc.pinned) return true
  if (removed.has(desc.key)) return false
  return revealed.has(desc.key) || desc.isPopulated(draft) || desc.isPopulated(original)
}

export function visibleFieldKeys(
  draft: IssueDraft,
  original: IssueDraft,
  revealed: ReadonlySet<RailFieldKey>,
  removed: ReadonlySet<RailFieldKey>,
): Set<RailFieldKey> {
  return new Set(
    RAIL_FIELDS.filter((f) => isFieldVisible(f, draft, original, revealed, removed)).map(
      (f) => f.key,
    ),
  )
}

export function hiddenFieldList(
  draft: IssueDraft,
  original: IssueDraft,
  revealed: ReadonlySet<RailFieldKey>,
  removed: ReadonlySet<RailFieldKey>,
): RailFieldDescriptor[] {
  return RAIL_FIELDS.filter(
    (f) => !f.pinned && !isFieldVisible(f, draft, original, revealed, removed),
  )
}
