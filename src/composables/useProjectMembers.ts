import { useQuery } from '@tanstack/vue-query'
import { computed, type Ref } from 'vue'
import { graphql } from '@/gitlab/generated'
import { gqlClient } from '@/gitlab/client'
import { normalizeError, type GitLabError } from '@/gitlab/errors'

// The project's members — used to populate the assignee picker in the issue
// composer. There is no app-wide users query we rely on; previously assignees
// were only known from already-loaded issues.
const ProjectMembersDocument = graphql(`
  query ProjectMembers($fullPath: ID!) {
    project(fullPath: $fullPath) {
      projectMembers(first: 100) {
        nodes {
          user {
            id
            username
            name
            avatarUrl
          }
        }
      }
    }
  }
`)

async function fetchMembers(fullPath: string) {
  try {
    const data = await gqlClient.request(ProjectMembersDocument, { fullPath })
    return (
      data.project?.projectMembers?.nodes
        ?.map((n) => n?.user)
        .filter((u): u is NonNullable<typeof u> => !!u) ?? []
    )
  } catch (e) {
    throw normalizeError(e)
  }
}

export type ProjectMember = Awaited<ReturnType<typeof fetchMembers>>[number]

export function useProjectMembers(fullPath: Ref<string>) {
  return useQuery<ProjectMember[], GitLabError>({
    queryKey: computed(() => ['members', fullPath.value]),
    queryFn: () => fetchMembers(fullPath.value),
    staleTime: 5 * 60 * 1000,
  })
}
