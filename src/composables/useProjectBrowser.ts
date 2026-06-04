import { computed, type Ref } from 'vue'
import { useProjects } from './useProjects'
import { useStarredProjects } from './useStarredProjects'
import { useAssignedProjects } from './useAssignedProjects'

export type BrowserSectionKey = 'starred' | 'assigned' | 'all'

export interface BrowserRow {
  name: string
  fullPath: string
  starred: boolean
  assignedOpen?: number
  section: BrowserSectionKey
}

// Composes the membership list (searchable, paginated) with the user's starred
// projects and assigned-issue projects into one ordered, de-duplicated row list:
// Starred, then Assigned to me, then everything else. A project appears once, in
// its highest-priority section. While searching, the sections collapse to the
// flat membership results (the only searchable source), stars still annotated.
export function useProjectBrowser(search: Ref<string>) {
  const all = useProjects(search)
  const { starred } = useStarredProjects()
  const { assigned } = useAssignedProjects()

  const searching = computed(() => search.value.trim().length > 0)

  const flatRows = computed<BrowserRow[]>(() => {
    const starredSet = new Set(starred.value.map((p) => p.fullPath))

    if (searching.value) {
      return all.projects.value.map((p) => ({
        name: p.name,
        fullPath: p.fullPath,
        starred: starredSet.has(p.fullPath),
        section: 'all' as const,
      }))
    }

    const assignedSet = new Set(assigned.value.map((a) => a.fullPath))

    const starredRows = starred.value.map<BrowserRow>((p) => ({
      name: p.name,
      fullPath: p.fullPath,
      starred: true,
      section: 'starred',
    }))
    const assignedRows = assigned.value
      .filter((a) => !starredSet.has(a.fullPath))
      .map<BrowserRow>((a) => ({
        name: a.name,
        fullPath: a.fullPath,
        starred: false,
        assignedOpen: a.assignedOpen,
        section: 'assigned',
      }))
    const allRows = all.projects.value
      .filter((p) => !starredSet.has(p.fullPath) && !assignedSet.has(p.fullPath))
      .map<BrowserRow>((p) => ({
        name: p.name,
        fullPath: p.fullPath,
        starred: false,
        section: 'all',
      }))

    return [...starredRows, ...assignedRows, ...allRows]
  })

  const count = computed(() => flatRows.value.length)
  const hasMore = computed(() => all.hasNextPage.value ?? false)

  return {
    flatRows,
    count,
    searching,
    isLoading: all.isLoading,
    error: all.error,
    hasMore,
    fetchNextPage: all.fetchNextPage,
    isFetchingNextPage: all.isFetchingNextPage,
  }
}
