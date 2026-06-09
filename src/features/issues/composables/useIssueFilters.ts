import { computed, ref, watch } from 'vue'
import { useRoute, useRouter, type LocationQueryRaw } from 'vue-router'
import { watchDebounced } from '@vueuse/core'
import type { IssueFilters } from '@/gitlab/issueParams'
import type { SortKey, GroupKey } from '@/features/issues/lib/issueView'
import type { ViewSlice } from '@/shared/composables/useSavedViews'

type State = NonNullable<IssueFilters['state']>
type View = 'list' | 'board'

const asArray = (v: unknown): string[] =>
  Array.isArray(v)
    ? v.filter((x): x is string => typeof x === 'string')
    : typeof v === 'string' && v
      ? [v]
      : []
const asString = (v: unknown): string => (typeof v === 'string' ? v : '')

// URL keys that make up the persisted, per-project view-state slice. This is
// the unit a "saved view" snapshots and what the auto-save mirrors.
export const FILTER_KEYS = [
  'state',
  'label',
  'assignee',
  'author',
  'q',
  'sort',
  'group',
  'view',
  'scope',
] as const

/** A snapshot of the view-defining query keys (what a saved view stores). */
export type { ViewSlice }

const storageKey = (fullPath: string) => `lumen:issue-filters:${fullPath}`

function writeSaved(fullPath: string, slice: Record<string, string | string[]>) {
  try {
    if (Object.keys(slice).length) localStorage.setItem(storageKey(fullPath), JSON.stringify(slice))
    else localStorage.removeItem(storageKey(fullPath))
  } catch {
    // storage unavailable (quota / disabled) — degrade silently
  }
}

function readSaved(fullPath: string): Record<string, string | string[]> {
  try {
    const raw = localStorage.getItem(storageKey(fullPath))
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const out: Record<string, string | string[]> = {}
    for (const k of FILTER_KEYS) {
      const v = (parsed as Record<string, unknown>)[k]
      if (typeof v === 'string' || Array.isArray(v)) out[k] = v as string | string[]
    }
    return out
  } catch {
    return {}
  }
}

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
  // Board column grouping. Shares the list's GroupKey vocabulary — 'status',
  // 'assignee', or 'label:<scope>'. Defaults to native Status; a legacy bare
  // scope (?scope=team, from when this only held label scopes) migrates to
  // label:<scope> on read so old links and saved views still resolve.
  const scope = computed<GroupKey>({
    get: () => {
      const raw = asString(route.query.scope)
      if (!raw) return 'status'
      if (raw === 'status' || raw === 'assignee' || raw.startsWith('label:')) return raw as GroupKey
      return `label:${raw}` as GroupKey
    },
    set: (v) => patch({ scope: v === 'status' ? undefined : v }),
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

  // The current view-defining query slice — the same keys the auto-save mirrors
  // and the unit a saved view captures.
  const viewSlice = computed<ViewSlice>(() => {
    const slice: ViewSlice = {}
    for (const k of FILTER_KEYS) {
      const v = route.query[k]
      if (v != null) slice[k] = v as string | string[]
    }
    return slice
  })

  // Replace the whole filter slice with a saved view: every filter key is set
  // (present ones to their value, absent ones cleared) so nothing leaks from the
  // prior view. Unrelated keys (e.g. ?issue=) are preserved; the search ref
  // re-hydrates via its existing watch on route.query.q.
  function applyView(slice: ViewSlice) {
    const next: Partial<Record<string, string | string[] | undefined>> = {}
    for (const k of FILTER_KEYS) next[k] = slice[k] ?? undefined
    patch(next)
  }

  const fullPath = computed(() => asString(route.params.fullPath))

  // On arrival / project switch, restore saved state — but only when the URL
  // specifies none of the filter keys, so explicit and shared links win.
  watch(
    fullPath,
    (path) => {
      if (!path) return
      if (FILTER_KEYS.some((k) => route.query[k] != null)) return
      const saved = readSaved(path)
      if (Object.keys(saved).length) void router.replace({ query: { ...route.query, ...saved } })
    },
    { immediate: true },
  )

  // Mirror the URL's filter slice into per-project storage on every change.
  // On the initial mount pass we skip an empty slice so we don't clobber any
  // saved state before it can be restored; later resets to default still clear.
  let firstPersist = true
  watch(
    () => FILTER_KEYS.map((k) => route.query[k]),
    () => {
      const path = fullPath.value
      if (!path) {
        firstPersist = false
        return
      }
      const slice: Record<string, string | string[]> = {}
      for (const k of FILTER_KEYS) {
        const v = route.query[k]
        if (v != null) slice[k] = v as string | string[]
      }
      if (firstPersist && !Object.keys(slice).length) {
        firstPersist = false
        return
      }
      firstPersist = false
      writeSaved(path, slice)
    },
    { immediate: true },
  )

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
    viewSlice,
    applyView,
  }
}
