import { useLocalStorage } from '@vueuse/core'
import { computed, type Ref } from 'vue'
import { FILTER_KEYS, type ViewSlice } from '@/composables/useIssueFilters'

// A named snapshot of the view-defining query slice (filters, sort, group,
// view, scope, state, search). Stored per-project so a user can flip between
// their own working sets — "My open bugs", "Team board", etc.
export interface SavedView {
  id: string
  name: string
  query: ViewSlice
}

const storageKey = (fullPath: string) => `lumen:saved-views:${fullPath}`

// Normalize a query value to a sorted string array so a view matches the live
// query regardless of label order or string-vs-single-element-array encoding
// (vue-router stores `?label=bug` as a string but `?label=bug&label=ui` as an
// array; both should compare equal to the saved snapshot).
const asArray = (v: unknown): string[] =>
  Array.isArray(v)
    ? v
        .filter((x): x is string => typeof x === 'string')
        .slice()
        .sort()
    : typeof v === 'string' && v
      ? [v]
      : []

/** True when two slices select the same view across every filter key. */
export function sameView(a: ViewSlice, b: ViewSlice): boolean {
  for (const k of FILTER_KEYS) {
    const av = asArray(a[k])
    const bv = asArray(b[k])
    if (av.length !== bv.length || av.some((x, i) => x !== bv[i])) return false
  }
  return true
}

// Keep only the recognized filter keys with usable values, so a stored view
// can't smuggle in unrelated query state.
function pickSlice(query: ViewSlice): ViewSlice {
  const out: ViewSlice = {}
  for (const k of FILTER_KEYS) {
    const v = query[k]
    if (typeof v === 'string' ? v : Array.isArray(v) && v.length) out[k] = v
  }
  return out
}

function newId(): string {
  try {
    return crypto.randomUUID()
  } catch {
    // Fallback for environments without crypto.randomUUID.
    return `v${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
  }
}

/**
 * Per-project saved views, persisted in localStorage. The list re-keys when the
 * project changes, so each project keeps its own set. `add` snapshots the slice
 * you pass (typically the live `viewSlice` from {@link useIssueFilters}).
 */
export function useSavedViews(fullPath: Ref<string>) {
  // Default `[]` makes useLocalStorage pick the JSON serializer; the getter key
  // re-reads storage on project switch.
  const stored = useLocalStorage<SavedView[]>(() => storageKey(fullPath.value), [])

  const views = computed(() => stored.value)

  function add(name: string, query: ViewSlice): SavedView | null {
    const trimmed = name.trim()
    const slice = pickSlice(query)
    if (!trimmed || !Object.keys(slice).length) return null
    const view: SavedView = { id: newId(), name: trimmed, query: slice }
    stored.value = [...stored.value, view]
    return view
  }

  // Overwrite an existing view's query with a new snapshot (e.g. you loaded a
  // view, tweaked the filters, and want to save the changes back to it).
  function update(id: string, query: ViewSlice): boolean {
    const slice = pickSlice(query)
    if (!Object.keys(slice).length) return false
    let found = false
    stored.value = stored.value.map((v) => {
      if (v.id !== id) return v
      found = true
      return { ...v, query: slice }
    })
    return found
  }

  function remove(id: string) {
    stored.value = stored.value.filter((v) => v.id !== id)
  }

  function rename(id: string, name: string) {
    const trimmed = name.trim()
    if (!trimmed) return
    stored.value = stored.value.map((v) => (v.id === id ? { ...v, name: trimmed } : v))
  }

  /** The id of the saved view matching `slice`, or null when none does. */
  function activeId(slice: ViewSlice): string | null {
    return views.value.find((v) => sameView(v.query, slice))?.id ?? null
  }

  return { views, add, update, remove, rename, activeId }
}
