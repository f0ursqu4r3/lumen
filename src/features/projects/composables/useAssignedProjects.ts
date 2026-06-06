import { useQuery } from '@tanstack/vue-query'
import { computed } from 'vue'
import { restGet } from '@/gitlab/rest'
import { aggregateAssigned, type AssignedProject, type RestIssue } from '@/features/projects/lib/assignedProjects'
import type { GitLabError } from '@/gitlab/errors'

export const ASSIGNED_KEY = ['projects', 'assigned'] as const

// Projects where the current user has open issues assigned to them — the live
// triage targets, derived from the cross-project assigned-issues feed.
export function useAssignedProjects() {
  const query = useQuery<AssignedProject[], GitLabError>({
    queryKey: ASSIGNED_KEY,
    queryFn: async () => {
      const issues = await restGet<RestIssue[]>(
        '/issues?scope=assigned_to_me&state=opened&per_page=100',
      )
      return aggregateAssigned(issues)
    },
    staleTime: 60_000,
  })

  const assigned = computed(() => query.data.value ?? [])
  return Object.assign(query, { assigned })
}
