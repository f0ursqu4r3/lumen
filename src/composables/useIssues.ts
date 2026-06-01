import { useQuery } from '@tanstack/vue-query'
import { computed, type Ref } from 'vue'
import { graphql } from '@/gitlab/generated'
import type { IssuesQueryVariables } from '@/gitlab/generated/graphql'
import { gqlClient } from '@/gitlab/client'
import { normalizeError, type GitLabError } from '@/gitlab/errors'
import { issuesKey, toIssuesVars, type IssueFilters } from '@/gitlab/issueParams'

const IssuesDocument = graphql(`
  query Issues(
    $fullPath: ID!
    $state: IssuableState
    $labelName: [String]
    $assigneeUsernames: [String!]
    $milestoneTitle: [String]
    $search: String
    $after: String
  ) {
    project(fullPath: $fullPath) {
      issues(
        state: $state
        labelName: $labelName
        assigneeUsernames: $assigneeUsernames
        milestoneTitle: $milestoneTitle
        search: $search
        first: 20
        after: $after
        sort: UPDATED_DESC
      ) {
        nodes {
          iid
          title
          state
          webUrl
          labels { nodes { id title color } }
          assignees { nodes { id username avatarUrl } }
        }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
`)

async function fetchIssues(fullPath: string, filters: IssueFilters) {
  try {
    const data = await gqlClient.request(IssuesDocument, toIssuesVars(fullPath, filters) as IssuesQueryVariables)
    return {
      nodes:
        data.project?.issues?.nodes?.filter((n): n is NonNullable<typeof n> => !!n) ?? [],
      pageInfo: data.project?.issues?.pageInfo ?? { hasNextPage: false, endCursor: null },
    }
  } catch (e) {
    throw normalizeError(e)
  }
}

export type IssueListItem = Awaited<ReturnType<typeof fetchIssues>>['nodes'][number]

export function useIssues(fullPath: Ref<string>, filters: Ref<IssueFilters>) {
  return useQuery<Awaited<ReturnType<typeof fetchIssues>>, GitLabError>({
    queryKey: computed(() => issuesKey(fullPath.value, filters.value)),
    queryFn: () => fetchIssues(fullPath.value, filters.value),
  })
}
