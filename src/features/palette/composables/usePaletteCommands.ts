import { computed, type Ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useProjectBrowser } from '@/features/projects/composables/useProjectBrowser'
import { useSavedViews } from '@/shared/composables/useSavedViews'
import { usePaletteIssueSearch } from './usePaletteIssueSearch'
import {
  filterByQuery,
  issueCommands,
  issueJumpCommand,
  projectCommands,
  routeCommands,
  savedViewCommands,
} from '../lib/sources'
import { GROUP_ORDER, type Command, type CommandGroup, type PaletteContext } from '../lib/types'

// Short queries (< threshold chars) are exploratory — show all actions/views.
// Longer queries are targeting a specific command, so filter them.
const COMMAND_FILTER_MIN_LEN = 6
const commandFilterQuery = (q: string) => (q.length >= COMMAND_FILTER_MIN_LEN ? q : '')

export function usePaletteCommands(query: Ref<string>) {
  const router = useRouter()
  const route = useRoute()

  const currentProject = computed<string | null>(() => {
    const raw = route.params.fullPath
    return typeof raw === 'string' && raw ? raw : null
  })

  const { flatRows } = useProjectBrowser(query)
  // useSavedViews re-keys per project; pass a non-null ref (empty = no views).
  const projectRef = computed(() => currentProject.value ?? '')
  const { views } = useSavedViews(projectRef)
  const { hits, isFetching } = usePaletteIssueSearch(query, currentProject)

  const ctx = computed<PaletteContext>(() => ({
    currentProject: currentProject.value,
    query: query.value.trim(),
    router,
    route,
  }))

  const groups = computed(() => {
    const c = ctx.value
    const cmdQuery = commandFilterQuery(c.query)
    const byGroup: Record<CommandGroup, Command[]> = {
      Actions: filterByQuery(routeCommands(c), cmdQuery),
      Projects: projectCommands(flatRows.value, c),
      Issues: [issueJumpCommand(c), ...issueCommands(hits.value, c)].filter(
        (x): x is Command => x !== null,
      ),
      Views: filterByQuery(savedViewCommands(views.value, c), cmdQuery),
    }
    return GROUP_ORDER.map((group) => ({ group, items: byGroup[group] })).filter(
      (g) => g.items.length > 0,
    )
  })

  const flat = computed<Command[]>(() => groups.value.flatMap((g) => g.items))

  return { groups, flat, isSearching: isFetching }
}
