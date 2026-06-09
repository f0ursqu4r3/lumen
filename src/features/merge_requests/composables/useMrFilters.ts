import { computed, ref, watch } from 'vue'
import { useRoute, useRouter, type LocationQueryRaw } from 'vue-router'
import { watchDebounced } from '@vueuse/core'
import {
  MR_FILTER_KEYS,
  type MrDraft,
  type MrFilters,
  type MrSortKey,
  type MrState,
} from '@/features/merge_requests/lib/mrView'
import type { ViewSlice } from '@/shared/composables/useSavedViews'

const asArray = (v: unknown): string[] =>
  Array.isArray(v)
    ? v.filter((x): x is string => typeof x === 'string')
    : typeof v === 'string' && v
      ? [v]
      : []
const asString = (v: unknown): string => (typeof v === 'string' ? v : '')

const storageKey = (fullPath: string) => `lumen:mr-filters:${fullPath}`

function writeSaved(fullPath: string, slice: Record<string, string | string[]>) {
  try {
    if (Object.keys(slice).length) localStorage.setItem(storageKey(fullPath), JSON.stringify(slice))
    else localStorage.removeItem(storageKey(fullPath))
  } catch {
    /* storage unavailable — degrade silently */
  }
}
function readSaved(fullPath: string): Record<string, string | string[]> {
  try {
    const raw = localStorage.getItem(storageKey(fullPath))
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const out: Record<string, string | string[]> = {}
    for (const k of MR_FILTER_KEYS) {
      const v = (parsed as Record<string, unknown>)[k]
      if (typeof v === 'string' || Array.isArray(v)) out[k] = v as string | string[]
    }
    return out
  } catch {
    return {}
  }
}

export function useMrFilters() {
  const route = useRoute()
  const router = useRouter()

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

  const state = computed<MrState>({
    get: () => (asString(route.query.state) as MrState) || 'opened',
    set: (v) => patch({ state: v === 'opened' ? undefined : v }),
  })
  const labels = computed<string[]>({
    get: () => asArray(route.query.label),
    set: (v) => patch({ label: v }),
  })
  const author = computed<string>({
    get: () => asString(route.query.author),
    set: (v) => patch({ author: v || undefined }),
  })
  const assignee = computed<string>({
    get: () => asString(route.query.assignee),
    set: (v) => patch({ assignee: v || undefined }),
  })
  const reviewer = computed<string>({
    get: () => asString(route.query.reviewer),
    set: (v) => patch({ reviewer: v || undefined }),
  })
  const milestone = computed<string>({
    get: () => asString(route.query.milestone),
    set: (v) => patch({ milestone: v || undefined }),
  })
  const draft = computed<MrDraft>({
    get: () => (asString(route.query.draft) as MrDraft) || 'any',
    set: (v) => patch({ draft: v === 'any' ? undefined : v }),
  })
  const sort = computed<MrSortKey>({
    get: () => (asString(route.query.sort) as MrSortKey) || 'updated',
    set: (v) => patch({ sort: v === 'updated' ? undefined : v }),
  })

  const search = ref(asString(route.query.q))
  watchDebounced(search, (v) => patch({ q: v || undefined }), { debounce: 250 })
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
  function clearAll() {
    patch({
      label: undefined,
      author: undefined,
      assignee: undefined,
      reviewer: undefined,
      milestone: undefined,
    })
  }

  const activeCount = computed(
    () =>
      labels.value.length +
      (author.value ? 1 : 0) +
      (assignee.value ? 1 : 0) +
      (reviewer.value ? 1 : 0) +
      (milestone.value ? 1 : 0) +
      (draft.value !== 'any' ? 1 : 0),
  )

  const filters = computed<MrFilters>(() => ({
    state: state.value,
    labels: labels.value,
    author: author.value || undefined,
    assignee: assignee.value || undefined,
    reviewer: reviewer.value || undefined,
    milestone: milestone.value || undefined,
    draft: draft.value,
    sort: sort.value,
    search: search.value || undefined,
  }))

  const viewSlice = computed<ViewSlice>(() => {
    const slice: ViewSlice = {}
    for (const k of MR_FILTER_KEYS) {
      const v = route.query[k]
      if (v != null) slice[k] = v as string | string[]
    }
    return slice
  })

  function applyView(slice: ViewSlice) {
    const next: Partial<Record<string, string | string[] | undefined>> = {}
    for (const k of MR_FILTER_KEYS) next[k] = slice[k] ?? undefined
    patch(next)
  }

  const fullPath = computed(() => asString(route.params.fullPath))

  watch(
    fullPath,
    (path) => {
      if (!path) return
      if (MR_FILTER_KEYS.some((k) => route.query[k] != null)) return
      const saved = readSaved(path)
      if (Object.keys(saved).length) void router.replace({ query: { ...route.query, ...saved } })
    },
    { immediate: true },
  )

  let firstPersist = true
  watch(
    () => MR_FILTER_KEYS.map((k) => route.query[k]),
    () => {
      const path = fullPath.value
      if (!path) {
        firstPersist = false
        return
      }
      const slice: Record<string, string | string[]> = {}
      for (const k of MR_FILTER_KEYS) {
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
    labels,
    author,
    assignee,
    reviewer,
    milestone,
    draft,
    sort,
    search,
    activeCount,
    toggleLabel,
    clearAll,
    filters,
    viewSlice,
    applyView,
  }
}
