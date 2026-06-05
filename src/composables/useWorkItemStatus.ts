import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { computed, type Ref } from 'vue'
import { gqlClient } from '@/gitlab/client'
import { normalizeError, type GitLabError } from '@/gitlab/errors'

// GitLab's native work-item "Status" field (To do / In progress / Done / Won't
// do / Duplicate). It is a work-item *widget*, distinct from scoped labels and
// from the issue's open/closed state, and is read/written through the WorkItem
// GraphQL surface rather than UpdateIssue. These operations use raw query
// strings (not the typed `graphql()` wrapper) so the feature doesn't require
// re-running codegen against the live instance.

export interface WorkItemStatus {
  id: string
  name: string
  color: string
  iconName: string
  /** to_do | in_progress | done | canceled | triage */
  category: string
}

// The status list is defined on the project's namespace (its parent group); for
// the system-defined lifecycle every namespace returns the same five statuses.
const projectGroupPath = (fullPath: string) => fullPath.split('/').slice(0, -1).join('/')

const STATUSES_QUERY = `
  query WorkItemStatuses($groupPath: ID!) {
    namespace(fullPath: $groupPath) {
      statuses {
        nodes { id name color iconName category position }
      }
    }
  }
`

interface StatusesResult {
  namespace: { statuses: { nodes: (WorkItemStatus & { position: number })[] } | null } | null
}

/** Available work-item statuses for a project, in lifecycle order. */
export function useWorkItemStatuses(fullPath: Ref<string>) {
  return useQuery<WorkItemStatus[], GitLabError>({
    queryKey: computed(() => ['workItemStatuses', projectGroupPath(fullPath.value)]),
    queryFn: async () => {
      try {
        const data = await gqlClient.request<StatusesResult, { groupPath: string }>(
          STATUSES_QUERY,
          { groupPath: projectGroupPath(fullPath.value) },
        )
        const nodes = data.namespace?.statuses?.nodes ?? []
        // position orders within a category; categories already arrive in
        // lifecycle order (to_do → done → canceled), so a stable position sort
        // preserves that grouping while honoring custom intra-category order.
        return [...nodes]
          .sort((a, b) => a.position - b.position)
          .map(({ position: _position, ...s }) => s)
      } catch (e) {
        throw normalizeError(e)
      }
    },
    staleTime: 5 * 60 * 1000,
  })
}

const CURRENT_QUERY = `
  query WorkItemStatus($fullPath: ID!, $iid: String!) {
    project(fullPath: $fullPath) {
      workItems(iid: $iid) {
        nodes {
          id
          widgets {
            ... on WorkItemWidgetStatus {
              status { id name color iconName category }
            }
          }
        }
      }
    }
  }
`

interface CurrentResult {
  project: {
    workItems: {
      nodes: { id: string; widgets: { status?: WorkItemStatus | null }[] }[]
    } | null
  } | null
}

export interface WorkItemStatusState {
  /** The WorkItemID (e.g. gid://gitlab/WorkItem/123) — needed for the update. */
  workItemId: string | null
  status: WorkItemStatus | null
}

/** The work item id + current status for an issue (by iid). */
export function useWorkItemStatus(fullPath: Ref<string>, iid: Ref<string>) {
  return useQuery<WorkItemStatusState, GitLabError>({
    queryKey: computed(() => ['workItemStatus', fullPath.value, iid.value]),
    queryFn: async () => {
      try {
        const data = await gqlClient.request<CurrentResult, { fullPath: string; iid: string }>(
          CURRENT_QUERY,
          { fullPath: fullPath.value, iid: iid.value },
        )
        const node = data.project?.workItems?.nodes?.[0]
        if (!node) return { workItemId: null, status: null }
        // The status lives on whichever widget carries it; the rest lack `status`.
        const status = node.widgets.find((w) => w && 'status' in w && w.status)?.status ?? null
        return { workItemId: node.id, status }
      } catch (e) {
        throw normalizeError(e)
      }
    },
  })
}

const UPDATE_MUTATION = `
  mutation SetWorkItemStatus($id: WorkItemID!, $status: WorkItemsStatusesStatusID!) {
    workItemUpdate(input: { id: $id, statusWidget: { status: $status } }) {
      errors
      workItem {
        id
        widgets {
          ... on WorkItemWidgetStatus {
            status { id name color iconName category }
          }
        }
      }
    }
  }
`

interface UpdateResult {
  workItemUpdate: {
    errors: string[]
    workItem: { id: string; widgets: { status?: WorkItemStatus | null }[] } | null
  } | null
}

/**
 * Set an issue's work-item status. No optimistic cache update: the status is
 * buffered in the issue draft (the source of truth for display) and this fires
 * as part of the draft's save(), then invalidates so the next read is authoritative.
 */
export function useSetWorkItemStatus(fullPath: Ref<string>, iid: Ref<string>) {
  const qc = useQueryClient()
  return useMutation<WorkItemStatus | null, GitLabError, { workItemId: string; statusId: string }>({
    mutationFn: async ({ workItemId, statusId }) => {
      let data: UpdateResult
      try {
        data = await gqlClient.request<UpdateResult, { id: string; status: string }>(
          UPDATE_MUTATION,
          { id: workItemId, status: statusId },
        )
      } catch (e) {
        throw normalizeError(e)
      }
      const payload = data.workItemUpdate
      if (payload?.errors?.length) {
        throw { kind: 'graphql', message: payload.errors[0] } satisfies GitLabError
      }
      return payload?.workItem?.widgets.find((w) => w && 'status' in w && w.status)?.status ?? null
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workItemStatus', fullPath.value, iid.value] }),
  })
}
