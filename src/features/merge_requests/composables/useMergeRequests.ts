import { useInfiniteQuery } from '@tanstack/vue-query'
import { computed, type Ref } from 'vue'
import { gqlClient } from '@/gitlab/client'
import { normalizeError, type GitLabError } from '@/gitlab/errors'
import {
  MR_POLL_MS,
  mrListKey,
  toMrVars,
  type MrFilters,
} from '@/features/merge_requests/lib/mrView'

const MergeRequestsDocument = `
  query ProjectMergeRequests(
    $fullPath: ID!, $state: MergeRequestState, $sort: MergeRequestSort,
    $authorUsername: String, $assigneeUsername: String, $reviewerUsername: String,
    $labelName: [String!], $milestoneTitle: String, $draft: Boolean,
    $search: String, $after: String
  ) {
    project(fullPath: $fullPath) {
      mergeRequests(
        state: $state, sort: $sort, authorUsername: $authorUsername,
        assigneeUsername: $assigneeUsername, reviewerUsername: $reviewerUsername,
        labelName: $labelName, milestoneTitle: $milestoneTitle, draft: $draft,
        search: $search, first: 30, after: $after
      ) {
        pageInfo { hasNextPage endCursor }
        nodes {
          iid title state draft conflicts webUrl createdAt updatedAt mergedAt
          sourceBranch targetBranch approved approvalsRequired
          author { name username }
          assignees { nodes { name username } }
          reviewers { nodes { name username } }
          labels { nodes { id title color } }
          milestone { id title }
          headPipeline { id status }
        }
      }
    }
  }
`

type UserCore = { name?: string | null; username: string }
type LabelNode = { id: string; title: string; color: string }

export type MergeRequestListItem = {
  iid: string
  title: string
  state: string
  draft: boolean
  conflicts: boolean
  webUrl: string
  createdAt: string
  updatedAt: string
  mergedAt?: string | null
  sourceBranch: string
  targetBranch: string
  approved: boolean
  approvalsRequired?: number | null
  author?: UserCore | null
  assignees?: { nodes?: (UserCore | null)[] | null } | null
  reviewers?: { nodes?: (UserCore | null)[] | null } | null
  labels?: { nodes?: (LabelNode | null)[] | null } | null
  milestone?: { id: string; title: string } | null
  headPipeline?: { id: string; status: string } | null
}

type Result = {
  project?: {
    mergeRequests?: {
      pageInfo?: { hasNextPage: boolean; endCursor: string | null } | null
      nodes?: (MergeRequestListItem | null)[] | null
    } | null
  } | null
}

type Vars = ReturnType<typeof toMrVars> & {
  fullPath: string
  search?: string
  after?: string
}

async function fetchMrs(fullPath: string, filters: MrFilters, after?: string) {
  const vars: Vars = {
    fullPath,
    ...toMrVars(filters),
    search: filters.search || undefined,
    after,
  }
  try {
    const data = await gqlClient.request<Result, Vars>(MergeRequestsDocument, vars)
    return {
      nodes:
        data.project?.mergeRequests?.nodes?.filter((n): n is MergeRequestListItem => !!n) ?? [],
      pageInfo: data.project?.mergeRequests?.pageInfo ?? { hasNextPage: false, endCursor: null },
    }
  } catch (e) {
    throw normalizeError(e)
  }
}

type MrsPage = Awaited<ReturnType<typeof fetchMrs>>

export function useMergeRequests(fullPath: Ref<string>, filters: Ref<MrFilters>) {
  const query = useInfiniteQuery<MrsPage, GitLabError>({
    queryKey: computed(() => mrListKey(fullPath.value, filters.value)),
    queryFn: ({ pageParam }) =>
      fetchMrs(fullPath.value, filters.value, pageParam as string | undefined),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) =>
      last.pageInfo.hasNextPage ? (last.pageInfo.endCursor ?? undefined) : undefined,
    refetchInterval: MR_POLL_MS,
    refetchOnWindowFocus: true,
  })

  const mergeRequests = computed(() => query.data.value?.pages.flatMap((p) => p.nodes) ?? [])
  return Object.assign(query, { mergeRequests })
}
