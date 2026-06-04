import { useQuery } from '@tanstack/vue-query'
import { computed } from 'vue'
import { restGet } from '@/gitlab/rest'
import type { GitLabError } from '@/gitlab/errors'

// The slice of GET /projects we use. `simple=true` keeps the payload light.
interface RestProject {
  name: string
  path_with_namespace: string
}

export interface StarredProject {
  name: string
  fullPath: string
}

export const STARRED_KEY = ['projects', 'starred'] as const

// The user's GitLab-native starred projects (synced with the GitLab web UI).
export function useStarredProjects() {
  const query = useQuery<StarredProject[], GitLabError>({
    queryKey: STARRED_KEY,
    queryFn: async () => {
      const rows = await restGet<RestProject[]>(
        '/projects?starred=true&membership=true&simple=true&per_page=100&order_by=name&sort=asc',
      )
      return rows.map((p) => ({ name: p.name, fullPath: p.path_with_namespace }))
    },
    staleTime: 60_000,
  })

  const starred = computed(() => query.data.value ?? [])
  return Object.assign(query, { starred })
}
