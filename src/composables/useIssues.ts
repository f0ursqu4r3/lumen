import { useInfiniteQuery } from '@tanstack/vue-query'
import { computed, type Ref } from 'vue'
import { graphql } from '@/gitlab/generated'
import { gqlClient } from '@/gitlab/client'
import { normalizeError, type GitLabError } from '@/gitlab/errors'
import { issuesKey, toIssuesVars, type IssueFilters } from '@/gitlab/issueParams'

const IssuesDocument = graphql(`
  query Issues(
    $fullPath: ID!
    $state: IssuableState
    $labelName: [String]
    $assigneeUsernames: [String!]
    $assigneeWildcardId: AssigneeWildcardId
    $authorUsername: String
    $milestoneTitle: [String]
    $search: String
    $after: String
  ) {
    project(fullPath: $fullPath) {
      issues(
        state: $state
        labelName: $labelName
        assigneeUsernames: $assigneeUsernames
        assigneeWildcardId: $assigneeWildcardId
        authorUsername: $authorUsername
        milestoneTitle: $milestoneTitle
        search: $search
        first: 50
        after: $after
        sort: UPDATED_DESC
      ) {
        nodes {
          iid
          title
          state
          webUrl
          createdAt
          labels {
            nodes {
              id
              title
              color
            }
          }
          assignees {
            nodes {
              id
              name
              username
              avatarUrl
            }
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  }
`)

async function fetchIssues(fullPath: string, filters: IssueFilters, after?: string) {
  try {
    const data = await gqlClient.request(IssuesDocument, toIssuesVars(fullPath, filters, after))
    return {
      nodes: data.project?.issues?.nodes?.filter((n): n is NonNullable<typeof n> => !!n) ?? [],
      pageInfo: data.project?.issues?.pageInfo ?? {
        hasNextPage: false,
        endCursor: null,
      },
    }
  } catch (e) {
    throw normalizeError(e)
  }
}

type IssuesPage = Awaited<ReturnType<typeof fetchIssues>>
export type IssueListItem = IssuesPage['nodes'][number]

export function useIssues(fullPath: Ref<string>, filters: Ref<IssueFilters>) {
  const query = useInfiniteQuery<IssuesPage, GitLabError>({
    queryKey: computed(() => issuesKey(fullPath.value, filters.value)),
    queryFn: ({ pageParam }) =>
      fetchIssues(fullPath.value, filters.value, pageParam as string | undefined),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) =>
      last.pageInfo.hasNextPage ? (last.pageInfo.endCursor ?? undefined) : undefined,
  })

  // Flatten the paged results so callers see one contiguous list.
  const issues = computed(() => query.data.value?.pages.flatMap((p) => p.nodes) ?? [])

  return Object.assign(query, { issues })
}
