import { useInfiniteQuery } from '@tanstack/vue-query'
import { computed, type Ref } from 'vue'
import { graphql } from '@/gitlab/generated'
import { gqlClient } from '@/gitlab/client'
import { normalizeError, type GitLabError } from '@/gitlab/errors'

const ProjectsDocument = graphql(`
  query Projects($search: String, $after: String) {
    projects(
      membership: true
      search: $search
      first: 50
      after: $after
      sort: "latest_activity_desc"
    ) {
      nodes {
        id
        fullPath
        name
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`)

async function fetchProjects(search: string, after?: string) {
  try {
    const data = await gqlClient.request(ProjectsDocument, {
      search: search || null,
      after: after ?? null,
    })
    return {
      nodes: data.projects?.nodes?.filter((n): n is NonNullable<typeof n> => !!n) ?? [],
      pageInfo: data.projects?.pageInfo ?? {
        hasNextPage: false,
        endCursor: null,
      },
    }
  } catch (e) {
    throw normalizeError(e)
  }
}

type ProjectsPage = Awaited<ReturnType<typeof fetchProjects>>
export type ProjectSummary = ProjectsPage['nodes'][number]

export function useProjects(search: Ref<string>) {
  const query = useInfiniteQuery<ProjectsPage, GitLabError>({
    queryKey: computed(() => ['projects', search.value] as const),
    queryFn: ({ pageParam }) => fetchProjects(search.value, pageParam as string | undefined),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) =>
      last.pageInfo.hasNextPage ? (last.pageInfo.endCursor ?? undefined) : undefined,
    placeholderData: (prev) => prev,
  })

  // Flatten the paged results so the picker sees one contiguous list.
  const projects = computed(() => query.data.value?.pages.flatMap((p) => p.nodes) ?? [])

  return Object.assign(query, { projects })
}
