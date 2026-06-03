import { computed, ref, watch } from 'vue'
import { useRoute, useRouter, type LocationQueryRaw } from 'vue-router'
import { watchDebounced } from '@vueuse/core'
import type { IssueFilters } from '@/gitlab/issueParams'
import type { SortKey, GroupKey } from '@/lib/issueView'

type State = NonNullable<IssueFilters['state']>
type View = 'list' | 'board'

const asArray = (v: unknown): string[] =>
  Array.isArray(v)
    ? v.filter((x): x is string => typeof x === 'string')
    : typeof v === 'string' && v
      ? [v]
      : []
const asString = (v: unknown): string => (typeof v === 'string' ? v : '')

/**
 * Single source of truth for the issue filters, round-tripped through the route
 * query so links are shareable and back/forward works. Search is held locally
 * and debounced into the URL to keep the text input responsive.
 */
export function useIssueFilters() {
  const route = useRoute()
  const router = useRouter()

  // Merge into the existing query (preserving e.g. ?issue=), dropping empties.
  // Single-element arrays are normalized to a plain string so vue-router stores
  // them as `?key=value` rather than `?key[0]=value`, matching what the URL
  // looks like after a page reload and what `asArray` can hydrate back.
  // Pending changes are buffered so that multiple synchronous calls (e.g. two
  // computed setters firing in the same tick) are coalesced into one replace.
  let pending: Partial<Record<string, string | string[] | undefined>> | null = null
  function patch(next: Partial<Record<string, string | string[] | undefined>>) {
    if (pending) {
      Object.assign(pending, next)
      return
    }
    pending = { ...next }
    Promise.resolve().then(() => {
      const changes = pending!
      pending = null
      const query: LocationQueryRaw = { ...route.query }
      for (const [k, v] of Object.entries(changes)) {
        if (v === undefined || v === '' || (Array.isArray(v) && !v.length)) delete query[k]
        else query[k] = Array.isArray(v) && v.length === 1 ? v[0] : v
      }
      void router.replace({ query })
    })
  }

  const state = computed<State>({
    get: () => (asString(route.query.state) as State) || 'opened',
    set: (v) => patch({ state: v === 'opened' ? undefined : v }),
  })
  const labels = computed<string[]>({
    get: () => asArray(route.query.label),
    set: (v) => patch({ label: v }),
  })
  const assignee = computed<string>({
    get: () => asString(route.query.assignee),
    set: (v) => patch({ assignee: v || undefined }),
  })
  const author = computed<string>({
    get: () => asString(route.query.author),
    set: (v) => patch({ author: v || undefined }),
  })

  const sort = computed<SortKey>({
    get: () => (asString(route.query.sort) as SortKey) || 'updated',
    set: (v) => patch({ sort: v === 'updated' ? undefined : v }),
  })
  const group = computed<GroupKey>({
    get: () => (asString(route.query.group) as GroupKey) || 'none',
    set: (v) => patch({ group: v === 'none' ? undefined : v }),
  })
  const view = computed<View>({
    get: () => (asString(route.query.view) as View) || 'list',
    set: (v) => patch({ view: v === 'list' ? undefined : v }),
  })
  const scope = computed<string>({
    get: () => asString(route.query.scope) || 'assigned',
    set: (v) => patch({ scope: v && v !== 'assigned' ? v : undefined }),
  })

  // Search: local ref bound to the input, debounced out to the URL, hydrated
  // back in on external query changes (back/forward, clearAll).
  const search = ref(asString(route.query.q))
  watchDebounced(search, (v) => patch({ q: v || undefined }), {
    debounce: 250,
  })
  watch(
    () => route.query.q,
    (v) => {
      const s = asString(v)
      if (s !== search.value) search.value = s
    },
  )

  function toggleLabel(title: string) {
    labels.value = labels.value.includes(title)
      ? labels.value.filter((t) => t !== title)
      : [...labels.value, title]
  }
  // Clears only the filter chips; sort/group/view/scope/state/search are left as-is.
  function clearAll() {
    patch({ label: undefined, assignee: undefined, author: undefined })
  }

  const activeCount = computed(
    () => labels.value.length + (assignee.value ? 1 : 0) + (author.value ? 1 : 0),
  )

  const filters = computed<IssueFilters>(() => ({
    state: state.value,
    search: search.value || undefined,
    labels: labels.value,
    assignee: assignee.value || undefined,
    author: author.value || undefined,
  }))

  return {
    state,
    search,
    labels,
    assignee,
    author,
    sort,
    group,
    view,
    scope,
    activeCount,
    toggleLabel,
    clearAll,
    filters,
  }
}
