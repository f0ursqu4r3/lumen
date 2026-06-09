import { useLocalStorage } from '@vueuse/core'
import { computed, watch, type Ref } from 'vue'

/** A snapshot of view-defining query keys (string or string[] values). */
export type ViewSlice = Record<string, string | string[]>

export interface SavedView {
  id: string
  name: string
  query: ViewSlice
}

const storageKey = (namespace: string, fullPath: string) =>
  `lumen:saved-views:${namespace}:${fullPath}`

const asArray = (v: unknown): string[] =>
  Array.isArray(v)
    ? v
        .filter((x): x is string => typeof x === 'string')
        .slice()
        .sort()
    : typeof v === 'string' && v
      ? [v]
      : []

/** True when two slices select the same view across every provided key. */
export function sameView(a: ViewSlice, b: ViewSlice, keys: readonly string[]): boolean {
  for (const k of keys) {
    const av = asArray(a[k])
    const bv = asArray(b[k])
    if (av.length !== bv.length || av.some((x, i) => x !== bv[i])) return false
  }
  return true
}

function pickSlice(query: ViewSlice, keys: readonly string[]): ViewSlice {
  const out: ViewSlice = {}
  for (const k of keys) {
    const v = query[k]
    if (typeof v === 'string' ? v : Array.isArray(v) && v.length) out[k] = v
  }
  return out
}

function newId(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return `v${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
  }
}

/**
 * Per-project saved views, persisted in localStorage under a caller-supplied
 * namespace (e.g. 'issue' / 'mr') so different resources don't collide. `keys`
 * defines which slice keys are recognized for storage and matching.
 */
export function useSavedViews(
  fullPath: Ref<string>,
  namespace: 'issue' | 'mr',
  keys: readonly string[],
) {
  const stored = useLocalStorage<SavedView[]>(() => storageKey(namespace, fullPath.value), [])
  const views = computed(() => stored.value)

  // One-time migration: the storage key gained a namespace segment. Issue saved
  // views used to live at the un-namespaced `lumen:saved-views:<path>`; move them
  // to the namespaced key on first encounter so they aren't silently lost.
  if (namespace === 'issue') {
    watch(
      fullPath,
      (path) => {
        if (!path || stored.value.length) return
        try {
          const legacyKey = `lumen:saved-views:${path}`
          const legacy = window.localStorage.getItem(legacyKey)
          if (!legacy) return
          const parsed = JSON.parse(legacy)
          if (Array.isArray(parsed) && parsed.length) stored.value = parsed
          window.localStorage.removeItem(legacyKey)
        } catch {
          // malformed legacy data — ignore
        }
      },
      { immediate: true },
    )
  }

  function add(name: string, query: ViewSlice): SavedView | null {
    const trimmed = name.trim()
    const slice = pickSlice(query, keys)
    if (!trimmed || !Object.keys(slice).length) return null
    const view: SavedView = { id: newId(), name: trimmed, query: slice }
    stored.value = [...stored.value, view]
    return view
  }
  function update(id: string, query: ViewSlice): boolean {
    const slice = pickSlice(query, keys)
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
  function activeId(slice: ViewSlice): string | null {
    return views.value.find((v) => sameView(v.query, slice, keys))?.id ?? null
  }

  return { views, add, update, remove, rename, activeId }
}
