export interface IssueFilters {
  state?: 'opened' | 'closed' | 'all'
  labels?: string[]
  assignee?: string
  milestone?: string
  search?: string
}

export const issuesKey = (fullPath: string, filters: IssueFilters) =>
  ['issues', fullPath, filters] as const

export const issueKey = (fullPath: string, iid: string) =>
  ['issue', fullPath, iid] as const

export function toIssuesVars(fullPath: string, filters: IssueFilters, after?: string) {
  const vars: Record<string, unknown> = { fullPath }
  if (filters.state && filters.state !== 'all') vars.state = filters.state
  if (filters.labels?.length) vars.labelName = filters.labels
  if (filters.assignee) vars.assigneeUsernames = [filters.assignee]
  if (filters.milestone) vars.milestoneTitle = [filters.milestone]
  if (filters.search) vars.search = filters.search
  if (after) vars.after = after
  return vars
}
