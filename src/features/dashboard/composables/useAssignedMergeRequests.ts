import { useQuery } from '@tanstack/vue-query'
import { computed } from 'vue'
import { gqlClient } from '@/gitlab/client'
import { normalizeError, type GitLabError } from '@/gitlab/errors'
import {
  DASHBOARD_POLL_MS,
  MR_NODE_FIELDS,
  dashboardKeys,
  type DashboardMr,
} from '@/features/dashboard/lib/dashboard'

const AssignedMrsDocument = `
  query AssignedMergeRequests {
    currentUser {
      assignedMergeRequests(state: opened, sort: UPDATED_DESC, first: 25) {
        nodes { ${MR_NODE_FIELDS} }
        pageInfo { hasNextPage }
      }
    }
  }
`

type Result = {
  currentUser?: {
    assignedMergeRequests?: {
      nodes?: (DashboardMr | null)[] | null
      pageInfo?: { hasNextPage: boolean } | null
    } | null
  } | null
}

async function fetchAssignedMrs() {
  try {
    const data = await gqlClient.request<Result>(AssignedMrsDocument)
    const conn = data.currentUser?.assignedMergeRequests
    return {
      nodes: conn?.nodes?.filter((n): n is DashboardMr => !!n) ?? [],
      hasNextPage: conn?.pageInfo?.hasNextPage ?? false,
    }
  } catch (e) {
    throw normalizeError(e)
  }
}

export function useAssignedMergeRequests() {
  const query = useQuery<{ nodes: DashboardMr[]; hasNextPage: boolean }, GitLabError>({
    queryKey: dashboardKeys.assignedMrs,
    queryFn: fetchAssignedMrs,
    refetchInterval: DASHBOARD_POLL_MS,
    refetchOnWindowFocus: true,
  })
  const mrs = computed(() => query.data.value?.nodes ?? [])
  const hasMore = computed(() => query.data.value?.hasNextPage ?? false)
  return Object.assign(query, { mrs, hasMore })
}
