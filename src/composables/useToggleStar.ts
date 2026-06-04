import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { restPost } from '@/gitlab/rest'
import { STARRED_KEY, type StarredProject } from './useStarredProjects'
import type { GitLabError } from '@/gitlab/errors'

export interface ToggleStarVars {
  fullPath: string
  name: string
  /** The project's CURRENT starred state; the mutation flips it. */
  starred: boolean
}

interface ToggleContext {
  prev?: StarredProject[]
}

// Star or unstar a project via REST (no GraphQL mutation exists for this). The
// starred list updates optimistically — the row hops to/from the Starred section
// immediately — and rolls back on failure. The encoded fullPath is a valid REST
// project id, so no numeric-id lookup is needed.
export function useToggleStar() {
  const qc = useQueryClient()

  return useMutation<unknown, GitLabError, ToggleStarVars, ToggleContext>({
    mutationFn: ({ fullPath, starred }) =>
      restPost(`/projects/${encodeURIComponent(fullPath)}/${starred ? 'unstar' : 'star'}`),

    onMutate: async ({ fullPath, name, starred }) => {
      await qc.cancelQueries({ queryKey: STARRED_KEY })
      const prev = qc.getQueryData<StarredProject[]>(STARRED_KEY)
      qc.setQueryData<StarredProject[]>(STARRED_KEY, (cur = []) =>
        starred
          ? cur.filter((p) => p.fullPath !== fullPath)
          : [...cur, { name, fullPath }].sort((a, b) => a.name.localeCompare(b.name)),
      )
      return { prev }
    },

    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(STARRED_KEY, ctx.prev)
    },

    onSettled: () => qc.invalidateQueries({ queryKey: STARRED_KEY }),
  })
}
