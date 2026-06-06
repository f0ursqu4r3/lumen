import { useQuery } from '@tanstack/vue-query'
import { computed, type Ref } from 'vue'
import { graphql } from '@/gitlab/generated'
import { gqlClient } from '@/gitlab/client'
import { normalizeError, type GitLabError } from '@/gitlab/errors'

// People who have actually worked the repo — merge request authors and the
// people assigned to those MRs — surfaced in the assignee picker as
// "Contributors". GitLab has no first-class *assignable* contributors list (the
// REST repository/contributors endpoint is keyed by commit email, not GitLab
// users), so we derive it from merge requests, which always reference real,
// assignable users. Deduped by username, most-recently-updated MR first.
const ProjectContributorsDocument = graphql(`
  query ProjectContributors($fullPath: ID!) {
    project(fullPath: $fullPath) {
      mergeRequests(first: 100, sort: UPDATED_DESC) {
        nodes {
          author {
            username
            name
            avatarUrl
            bot
          }
          assignees {
            nodes {
              username
              name
              avatarUrl
              bot
            }
          }
        }
      }
    }
  }
`)

export interface ProjectContributor {
  username: string
  name: string | null
  avatarUrl: string | null
}

async function fetchContributors(fullPath: string): Promise<ProjectContributor[]> {
  try {
    const data = await gqlClient.request(ProjectContributorsDocument, { fullPath })
    const byUsername = new Map<string, ProjectContributor>()
    for (const mr of data.project?.mergeRequests?.nodes ?? []) {
      if (!mr) continue
      for (const p of [mr.author, ...(mr.assignees?.nodes ?? [])]) {
        // Bots (auto-merge, project access tokens) aren't real contributors.
        if (!p?.username || p.bot || byUsername.has(p.username)) continue
        byUsername.set(p.username, {
          username: p.username,
          name: p.name ?? null,
          avatarUrl: p.avatarUrl ?? null,
        })
      }
    }
    return [...byUsername.values()]
  } catch (e) {
    throw normalizeError(e)
  }
}

export function useProjectContributors(fullPath: Ref<string>) {
  return useQuery<ProjectContributor[], GitLabError>({
    queryKey: computed(() => ['contributors', fullPath.value]),
    queryFn: () => fetchContributors(fullPath.value),
    staleTime: 5 * 60 * 1000,
  })
}
