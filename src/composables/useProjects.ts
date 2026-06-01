import { useQuery } from '@tanstack/vue-query'
import type { Ref } from 'vue'
import { graphql } from '@/gitlab/generated'
import { gqlClient } from '@/gitlab/client'
import { normalizeError, type GitLabError } from '@/gitlab/errors'

const ProjectsDocument = graphql(`
  query Projects($search: String) {
    projects(membership: true, search: $search, first: 20, sort: "latest_activity_desc") {
      nodes { id fullPath name }
    }
  }
`)

async function fetchProjects(search: string) {
  try {
    const data = await gqlClient.request(ProjectsDocument, { search: search || null })
    return data.projects?.nodes?.filter((n): n is NonNullable<typeof n> => !!n) ?? []
  } catch (e) {
    throw normalizeError(e)
  }
}

export type ProjectSummary = Awaited<ReturnType<typeof fetchProjects>>[number]

export function useProjects(search: Ref<string>) {
  return useQuery<ProjectSummary[], GitLabError>({
    queryKey: ['projects', search] as const,
    queryFn: () => fetchProjects(search.value),
    placeholderData: (prev) => prev,
  })
}
