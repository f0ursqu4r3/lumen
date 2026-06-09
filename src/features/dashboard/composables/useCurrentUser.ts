import { useQuery } from '@tanstack/vue-query'
import { gqlClient } from '@/gitlab/client'
import { normalizeError, type GitLabError } from '@/gitlab/errors'
import { dashboardKeys } from '@/features/dashboard/lib/dashboard'

const CurrentUserDocument = `
  query CurrentUser {
    currentUser {
      username
    }
  }
`

type Result = { currentUser?: { username: string } | null }

async function fetchCurrentUser(): Promise<string | null> {
  try {
    const data = await gqlClient.request<Result>(CurrentUserDocument)
    return data.currentUser?.username ?? null
  } catch (e) {
    throw normalizeError(e)
  }
}

/** The signed-in user's username. Stable for the session, so cached an hour. */
export function useCurrentUser() {
  return useQuery<string | null, GitLabError>({
    queryKey: dashboardKeys.currentUser,
    queryFn: fetchCurrentUser,
    staleTime: 1000 * 60 * 60,
  })
}
