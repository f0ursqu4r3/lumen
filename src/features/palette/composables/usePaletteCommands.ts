import { computed, type Ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useProjectBrowser } from '@/features/projects/composables/useProjectBrowser'
import { useSavedViews } from '@/shared/composables/useSavedViews'
import { FILTER_KEYS } from '@/features/issues/composables/useIssueFilters'
import { usePaletteIssueSearch } from './usePaletteIssueSearch'
import { usePaletteMrSearch } from './usePaletteMrSearch'
import {
  filterByQuery,
  issueCommands,
  issueJumpCommand,
  mrCommands,
  mrJumpCommand,
  projectCommands,
  routeCommands,
  savedViewCommands,
} from '../lib/sources'
import { GROUP_ORDER, type Command, type CommandGroup, type PaletteContext } from '../lib/types'

export function usePaletteCommands(query: Ref<string>) {
  const router = useRouter()
  const route = useRoute()

  const currentProject = computed<string | null>(() => {
    const raw = route.params.fullPath
    return typeof raw === 'string' && raw ? raw : null
  })

  const { flatRows } = useProjectBrowser(query)
  // useSavedViews re-keys per project; pass a non-null ref (empty = no views).
  // The palette surfaces the current project's issue saved views.
  const projectRef = computed(() => currentProject.value ?? '')
  const { views } = useSavedViews(projectRef, 'issue', FILTER_KEYS)
  const { hits, isFetching } = usePaletteIssueSearch(query, currentProject)
  const { hits: mrHits } = usePaletteMrSearch(query, currentProject)

  const ctx = computed<PaletteContext>(() => ({
    currentProject: currentProject.value,
    query: query.value.trim(),
    router,
    route,
  }))

  const groups = computed(() => {
    const c = ctx.value
    const byGroup: Record<CommandGroup, Command[]> = {
      // Actions and Views are name-filtered by the query (like the prior
      // palette); Projects arrive pre-filtered from useProjectBrowser and
      // Issues come from the search/jump sources.
      Actions: filterByQuery(routeCommands(c), c.query),
      Projects: projectCommands(flatRows.value, c),
      Issues: [issueJumpCommand(c), ...issueCommands(hits.value, c)].filter(
        (x): x is Command => x !== null,
      ),
      'Merge Requests': [mrJumpCommand(c), ...mrCommands(mrHits.value, c)].filter(
        (x): x is Command => x !== null,
      ),
      Views: filterByQuery(savedViewCommands(views.value, c), c.query),
    }
    return GROUP_ORDER.map((group) => ({ group, items: byGroup[group] })).filter(
      (g) => g.items.length > 0,
    )
  })

  const flat = computed<Command[]>(() => groups.value.flatMap((g) => g.items))

  // Palette consumers think in terms of "searching", not query "fetching".
  return { groups, flat, isSearching: isFetching }
}
