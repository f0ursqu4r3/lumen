// Pure draft/diff logic for buffered issue editing. Kept free of generated types
// (accepts the issue structurally) so it is trivially unit-testable.
export interface IssueDraft {
  title: string
  description: string
  state: 'opened' | 'closed'
  labelIds: string[]
  assigneeUsernames: string[]
  milestoneId: string | null
  dueDate: string
  weight: number | null
  confidential: boolean
  timeEstimate: string
  // GitLab's native work-item Status (a status GlobalID), or null when unset.
  // Seeded from a separate work-item query, so it is passed into draftFromIssue
  // rather than read off the issue.
  statusId: string | null
}

export function draftFromIssue(
  issue: {
    title: string
    description?: string | null
    state: string
    dueDate?: string | null
    weight?: number | null
    confidential?: boolean | null
    humanTimeEstimate?: string | null
    milestone?: { id: string } | null
    labels?: { nodes?: ({ id: string } | null)[] | null } | null
    assignees?: { nodes?: ({ username: string } | null)[] | null } | null
  },
  statusId: string | null = null,
): IssueDraft {
  return {
    title: issue.title,
    description: issue.description ?? '',
    state: issue.state as 'opened' | 'closed',
    labelIds: (issue.labels?.nodes ?? []).filter((l): l is { id: string } => !!l).map((l) => l.id),
    assigneeUsernames: (issue.assignees?.nodes ?? [])
      .filter((a): a is { username: string } => !!a)
      .map((a) => a.username),
    milestoneId: issue.milestone?.id ?? null,
    dueDate: issue.dueDate ? issue.dueDate.slice(0, 10) : '',
    weight: issue.weight ?? null,
    confidential: issue.confidential ?? false,
    timeEstimate: issue.humanTimeEstimate ?? '',
    statusId,
  }
}

const sameSet = (a: string[], b: string[]): boolean => {
  if (a.length !== b.length) return false
  const setA = new Set(a)
  return b.every((x) => setA.has(x))
}

export function isDirty(o: IssueDraft, d: IssueDraft): boolean {
  return (
    o.title !== d.title ||
    o.description !== d.description ||
    o.state !== d.state ||
    o.statusId !== d.statusId ||
    o.milestoneId !== d.milestoneId ||
    o.dueDate !== d.dueDate ||
    o.weight !== d.weight ||
    o.confidential !== d.confidential ||
    o.timeEstimate !== d.timeEstimate ||
    !sameSet(o.labelIds, d.labelIds) ||
    !sameSet(o.assigneeUsernames, d.assigneeUsernames)
  )
}

export interface IssueEditDiff {
  update?: {
    title?: string
    description?: string
    stateEvent?: 'CLOSE' | 'REOPEN'
    addLabelIds?: string[]
    removeLabelIds?: string[]
    milestoneId?: string | null
    dueDate?: string | null
    weight?: number | null
    confidential?: boolean
    timeEstimate?: string | null
  }
  assignees?: string[]
  // The work-item status to apply (a status GlobalID). Set only when it changed
  // to a concrete value — it rides the same save() as the rest of the diff.
  statusId?: string
}

export function diffIssueEdit(o: IssueDraft, d: IssueDraft): IssueEditDiff {
  const update: NonNullable<IssueEditDiff['update']> = {}
  if (o.title !== d.title) update.title = d.title
  if (o.description !== d.description) update.description = d.description
  if (o.state !== d.state) update.stateEvent = d.state === 'closed' ? 'CLOSE' : 'REOPEN'
  if (o.milestoneId !== d.milestoneId) update.milestoneId = d.milestoneId
  if (o.dueDate !== d.dueDate) update.dueDate = d.dueDate || null
  if (o.weight !== d.weight) update.weight = d.weight
  if (o.confidential !== d.confidential) update.confidential = d.confidential
  if (o.timeEstimate !== d.timeEstimate) update.timeEstimate = d.timeEstimate.trim() || null
  const addLabelIds = d.labelIds.filter((id) => !o.labelIds.includes(id))
  const removeLabelIds = o.labelIds.filter((id) => !d.labelIds.includes(id))
  if (addLabelIds.length) update.addLabelIds = addLabelIds
  if (removeLabelIds.length) update.removeLabelIds = removeLabelIds

  const diff: IssueEditDiff = {}
  if (Object.keys(update).length) diff.update = update
  if (!sameSet(o.assigneeUsernames, d.assigneeUsernames)) diff.assignees = d.assigneeUsernames
  if (o.statusId !== d.statusId && d.statusId) diff.statusId = d.statusId
  return diff
}
