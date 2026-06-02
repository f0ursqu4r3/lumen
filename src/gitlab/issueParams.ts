import type {
  IssuableState,
  IssuesQueryVariables,
} from "@/gitlab/generated/graphql";

export interface IssueFilters {
  state?: "opened" | "closed" | "all";
  labels?: string[];
  assignee?: string;
  milestone?: string;
  search?: string;
}

export const issuesKey = (fullPath: string, filters: IssueFilters) =>
  ["issues", fullPath, filters] as const;

export const issueKey = (fullPath: string, iid: string) =>
  ["issue", fullPath, iid] as const;

// Returns the generated IssuesQueryVariables so a GraphQL variable rename is a
// compile error here, not a runtime surprise. Empty/`all` filters map to
// undefined, which graphql-request omits from the request.
export function toIssuesVars(
  fullPath: string,
  filters: IssueFilters,
  after?: string,
): IssuesQueryVariables {
  return {
    fullPath,
    state:
      filters.state && filters.state !== "all"
        ? (filters.state as IssuableState)
        : undefined,
    labelName: filters.labels?.length ? filters.labels : undefined,
    assigneeUsernames: filters.assignee ? [filters.assignee] : undefined,
    milestoneTitle: filters.milestone ? [filters.milestone] : undefined,
    search: filters.search || undefined,
    after: after || undefined,
  };
}
