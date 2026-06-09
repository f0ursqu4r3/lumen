import { useQuery } from '@tanstack/vue-query'
import { computed, type Ref } from 'vue'
import { gqlClient } from '@/gitlab/client'
import { normalizeError, type GitLabError } from '@/gitlab/errors'
import {
  DASHBOARD_POLL_MS,
  dashboardKeys,
  type DashboardIssue,
} from '@/features/dashboard/lib/dashboard'

const AssignedIssuesDocument = `
  query AssignedIssues($username: String!) {
    issues(assigneeUsernames: [$username], state: opened, sort: UPDATED_DESC, first: 25) {
      nodes {
        iid
        title
        state
        webPath
        webUrl
        updatedAt
        labels { nodes { id title color } }
      }
      pageInfo { hasNextPage }
    }
  }
`

type Result = {
  issues?: {
    nodes?: (DashboardIssue | null)[] | null
    pageInfo?: { hasNextPage: boolean } | null
  } | null
}

async function fetchAssignedIssues(username: string) {
  try {
    const data = await gqlClient.request<Result, { username: string }>(AssignedIssuesDocument, {
      username,
    })
    return {
      nodes: data.issues?.nodes?.filter((n): n is DashboardIssue => !!n) ?? [],
      hasNextPage: data.issues?.pageInfo?.hasNextPage ?? false,
    }
  } catch (e) {
    throw normalizeError(e)
  }
}

export function useAssignedIssues(username: Ref<string | null | undefined>) {
  const enabled = computed(() => !!username.value)
  const query = useQuery<{ nodes: DashboardIssue[]; hasNextPage: boolean }, GitLabError>({
    queryKey: computed(() => dashboardKeys.assignedIssues(username.value ?? '')),
    queryFn: () => fetchAssignedIssues(username.value as string),
    enabled,
    refetchInterval: DASHBOARD_POLL_MS,
    refetchOnWindowFocus: true,
  })
  const issues = computed(() => query.data.value?.nodes ?? [])
  const hasMore = computed(() => query.data.value?.hasNextPage ?? false)
  return Object.assign(query, { issues, hasMore })
}
