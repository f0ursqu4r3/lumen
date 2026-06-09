import { useQuery } from '@tanstack/vue-query'
import { computed, type Ref } from 'vue'
import { refDebounced } from '@vueuse/core'
import { gqlClient } from '@/gitlab/client'
import { normalizeError, type GitLabError } from '@/gitlab/errors'
import type { PaletteIssueHit } from '../lib/types'

const PaletteIssueSearchDocument = `
  query PaletteIssueSearch($fullPath: ID!, $search: String!) {
    project(fullPath: $fullPath) {
      issues(search: $search, sort: UPDATED_DESC, first: 8) {
        nodes {
          iid
          title
          state
        }
      }
    }
  }
`

type Result = {
  project?: { issues?: { nodes?: (PaletteIssueHit | null)[] | null } | null } | null
}

const MIN_CHARS = 2
const isPureNumber = (q: string) => /^#?\d+$/.test(q)

/** Gate: a project is open, query is >=2 chars, and not a bare issue number. */
export function paletteSearchEnabled(query: string, project: string | null): boolean {
  const q = query.trim()
  return !!project && q.length >= MIN_CHARS && !isPureNumber(q)
}

async function fetchHits(fullPath: string, search: string): Promise<PaletteIssueHit[]> {
  try {
    const data = await gqlClient.request<Result, { fullPath: string; search: string }>(
      PaletteIssueSearchDocument,
      { fullPath, search },
    )
    return (data.project?.issues?.nodes ?? []).filter((n): n is PaletteIssueHit => !!n)
  } catch (e) {
    throw normalizeError(e)
  }
}

export function usePaletteIssueSearch(query: Ref<string>, currentProject: Ref<string | null>) {
  const debounced = refDebounced(query, 200)
  const search = computed(() => debounced.value.trim())
  const enabled = computed(() => paletteSearchEnabled(search.value, currentProject.value))

  const result = useQuery<PaletteIssueHit[], GitLabError>({
    queryKey: computed(() => ['palette-issue-search', currentProject.value, search.value]),
    queryFn: () => fetchHits(currentProject.value as string, search.value),
    enabled,
    staleTime: 10_000,
  })

  // A failed search must never break the palette: collapse error/loading to [].
  const hits = computed(() => result.data.value ?? [])
  const isFetching = computed(() => result.isFetching.value && enabled.value)

  return { hits, isFetching }
}
