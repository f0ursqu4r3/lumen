import { useQuery } from '@tanstack/vue-query'
import { computed, type Ref } from 'vue'
import { gqlClient } from '@/gitlab/client'
import { normalizeError, type GitLabError } from '@/gitlab/errors'

const ProjectMilestonesDocument = `
  query ProjectMilestones($fullPath: ID!) {
    project(fullPath: $fullPath) {
      milestones(first: 100, includeAncestors: true, state: active, sort: DUE_DATE_ASC) {
        nodes {
          id
          title
          dueDate
        }
      }
    }
  }
`

export type ProjectMilestone = {
  id: string
  title: string
  dueDate?: string | null
}

type Result = {
  project?: {
    milestones?: { nodes?: (ProjectMilestone | null)[] | null } | null
  } | null
}

async function fetchMilestones(fullPath: string): Promise<ProjectMilestone[]> {
  try {
    const data = await gqlClient.request<Result, { fullPath: string }>(ProjectMilestonesDocument, {
      fullPath,
    })
    return data.project?.milestones?.nodes?.filter((m): m is ProjectMilestone => !!m) ?? []
  } catch (e) {
    throw normalizeError(e)
  }
}

export function useProjectMilestones(fullPath: Ref<string>) {
  return useQuery<ProjectMilestone[], GitLabError>({
    queryKey: computed(() => ['milestones', fullPath.value]),
    queryFn: () => fetchMilestones(fullPath.value),
    staleTime: 5 * 60 * 1000,
  })
}
