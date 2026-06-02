import { useQuery } from '@tanstack/vue-query'
import { computed, type Ref } from 'vue'
import { graphql } from '@/gitlab/generated'
import { gqlClient } from '@/gitlab/client'
import { normalizeError, type GitLabError } from '@/gitlab/errors'

// The project's full label catalog — used so the board can show every column in
// a scope (e.g. assigned::stalled) even when no loaded issue currently uses it.
const ProjectLabelsDocument = graphql(`
  query ProjectLabels($fullPath: ID!) {
    project(fullPath: $fullPath) {
      labels(first: 100, includeAncestorGroups: true) {
        nodes {
          id
          title
          color
        }
      }
    }
  }
`)

async function fetchLabels(fullPath: string) {
  try {
    const data = await gqlClient.request(ProjectLabelsDocument, { fullPath })
    return (
      data.project?.labels?.nodes?.filter((l): l is NonNullable<typeof l> => !!l) ?? []
    )
  } catch (e) {
    throw normalizeError(e)
  }
}

export type ProjectLabel = Awaited<ReturnType<typeof fetchLabels>>[number]

export function useProjectLabels(fullPath: Ref<string>) {
  return useQuery<ProjectLabel[], GitLabError>({
    queryKey: computed(() => ['labels', fullPath.value]),
    queryFn: () => fetchLabels(fullPath.value),
    staleTime: 5 * 60 * 1000,
  })
}
