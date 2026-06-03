import type { IssuableState, IssuesQueryVariables } from '@/gitlab/generated/graphql'

// `assignee` carries either a username or the `__none__` sentinel (Unassigned).
export const UNASSIGNED = '__none__'

// How often issue data refetches in the background. GitLab has no project-level
// "issue created" subscription, so polling is the only way to keep the list
// live; the detail view rides the same cadence until per-issue subscriptions land.
export const ISSUE_POLL_MS = 30_000

export interface IssueFilters {
  state?: 'opened' | 'closed' | 'all'
  labels?: string[]
  assignee?: string
  author?: string
  milestone?: string
  search?: string
}

export const issuesKey = (fullPath: string, filters: IssueFilters) =>
  ['issues', fullPath, filters] as const

export const issueKey = (fullPath: string, iid: string) => ['issue', fullPath, iid] as const

// Returns the generated IssuesQueryVariables so a GraphQL variable rename is a
// compile error here, not a runtime surprise. Empty/`all` filters map to
// undefined, which graphql-request omits from the request.
export function toIssuesVars(
  fullPath: string,
  filters: IssueFilters,
  after?: string,
): IssuesQueryVariables {
  const assigned =
    filters.assignee && filters.assignee !== UNASSIGNED ? [filters.assignee] : undefined
  return {
    fullPath,
    state: filters.state && filters.state !== 'all' ? (filters.state as IssuableState) : undefined,
    labelName: filters.labels?.length ? filters.labels : undefined,
    assigneeUsernames: assigned,
    // GitLab models "unassigned" as a wildcard, not an empty username list.
    assigneeWildcardId:
      filters.assignee === UNASSIGNED
        ? ('NONE' as IssuesQueryVariables['assigneeWildcardId'])
        : undefined,
    authorUsername: filters.author || undefined,
    milestoneTitle: filters.milestone ? [filters.milestone] : undefined,
    search: filters.search || undefined,
    after: after || undefined,
  }
}
