# Merge Requests — Browse + Triage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a project-scoped Merge Requests browse + triage experience (filterable list + read-oriented full-page detail with threaded reply), mirroring the `features/issues/` patterns.

**Architecture:** New parallel `src/features/merge_requests/` module (own components, composables, pure `lib`). The only shared-code change is generalizing `useSavedViews` to take a storage namespace + filter keys so issues and MRs share it without colliding. GraphQL uses the manual template-literal + hand-written-type pattern of `useIssue.ts` (no codegen). The list uses `useInfiniteQuery` like `useIssues`. Palette gains an additive MR group/action.

**Tech Stack:** Vue 3 `<script setup>`, TypeScript, `@tanstack/vue-query` (`useInfiniteQuery`/`useMutation`), `@vueuse/core`, `graphql-request` via `gqlClient`, reka-ui, Tailwind v4. Tests: vitest (`bunx vitest run`), `@vue/test-utils`, `withQuery`.

**Conventions:**
- GraphQL = inline template-literal document + hand-written result type + `gqlClient.request<Result, Vars>`, errors via `normalizeError` (see `src/features/issues/composables/useIssue.ts`). **No codegen.**
- Query-composable tests mock `@/gitlab/client` + use `withQuery` (see `useIssues.test.ts`).
- Run `bun run format` after each task. Tests: `bunx vitest run` (never `bun test`).
- Mirror the named issue component for styling/classes where a task says "mirror X".

---

## File Structure

| Path | Responsibility |
|---|---|
| `src/shared/composables/useSavedViews.ts` | (modify) generalized: `useSavedViews(fullPath, namespace, keys)` |
| `src/features/issues/composables/useIssueSavedViews.ts` | (modify) pass `'issue'` + issue keys |
| `src/features/merge_requests/lib/mrView.ts` | pure: MR types, filter keys, slice→args mapping, sort/state/branch formatting, query keys |
| `src/features/merge_requests/lib/mrView.test.ts` | unit tests for the above |
| `src/features/merge_requests/composables/useMrFilters.ts` | URL-encoded MR filter slice |
| `src/features/merge_requests/composables/useMrFilters.test.ts` | filter round-trip tests |
| `src/features/merge_requests/composables/useMergeRequests.ts` | list infinite query |
| `src/features/merge_requests/composables/useMergeRequests.test.ts` | list query tests |
| `src/features/merge_requests/composables/useMergeRequest.ts` | detail query |
| `src/features/merge_requests/composables/useMergeRequest.test.ts` | detail query tests |
| `src/features/merge_requests/composables/useMrDiscussion.ts` | reply (createNote) mutation + reply state |
| `src/features/merge_requests/composables/useMrDiscussion.test.ts` | reply mutation tests |
| `src/features/merge_requests/components/MrStateBadge.vue` | open/draft/merged/closed pill |
| `src/features/merge_requests/components/MergeRequestRow.vue` | list row |
| `src/features/merge_requests/components/MergeRequestListHeader.vue` | header + nav buttons + count |
| `src/features/merge_requests/components/MergeRequestListToolbar.vue` | filter/sort/saved-views controls |
| `src/features/merge_requests/components/MrFilterPanel.vue` | filter pickers |
| `src/features/merge_requests/components/MergeRequestDetailRail.vue` | detail rail |
| `src/features/merge_requests/components/MrDiscussion.vue` | threads + per-thread reply |
| `src/views/MergeRequestList.vue` | list view (wires filters + query + infinite scroll) |
| `src/views/MergeRequestDetail.vue` | detail view (wires query + rail + discussion) |
| `src/router/index.ts` | (modify) two MR routes |
| `src/features/issues/components/IssueListHeader.vue` | (modify) "Merge Requests" button |
| `src/features/palette/**` | (modify) MR route action, group, jump + search source |
| `src/shared/lib/persist.ts` | (modify) exclude `'merge-requests'` search key |

---

## Task 1: Generalize `useSavedViews`

**Files:**
- Modify: `src/shared/composables/useSavedViews.ts`
- Modify: `src/features/issues/composables/useIssueSavedViews.ts`
- Test: `src/shared/composables/useSavedViews.test.ts` (extend)

- [ ] **Step 1: Update the existing test to the new signature and add a namespace test**

In `src/shared/composables/useSavedViews.test.ts`, the `sameView` tests currently rely on the hardcoded issue keys. Update the import and add a `keys` argument. Replace the file's `sameView` describe block and add a namespace test:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { ref } from 'vue'
import { useSavedViews, sameView } from './useSavedViews'

const KEYS = ['state', 'label', 'assignee', 'author', 'q', 'sort', 'group', 'view', 'scope'] as const

describe('sameView', () => {
  it('treats label order and string-vs-array as equal', () => {
    expect(sameView({ label: ['ui', 'bug'] }, { label: ['bug', 'ui'] }, KEYS)).toBe(true)
    expect(sameView({ label: 'bug' }, { label: ['bug'] }, KEYS)).toBe(true)
    expect(sameView({ sort: 'title' }, { sort: 'title' }, KEYS)).toBe(true)
  })
  it('distinguishes different values', () => {
    expect(sameView({ sort: 'title' }, { sort: 'priority' }, KEYS)).toBe(false)
    expect(sameView({ label: ['bug'] }, { label: ['bug', 'ui'] }, KEYS)).toBe(false)
    expect(sameView({ assignee: 'ada' }, {}, KEYS)).toBe(false)
  })
  it('ignores keys outside the provided set', () => {
    expect(sameView({ sort: 'title', issue: '9' }, { sort: 'title' }, KEYS)).toBe(true)
  })
})

describe('useSavedViews namespacing', () => {
  beforeEach(() => window.localStorage.clear())

  it('stores views under the given namespace, isolated from other namespaces', () => {
    const issues = useSavedViews(ref('grp/proj'), 'issue', KEYS)
    issues.add('Bugs', { label: 'bug' })
    const mrs = useSavedViews(ref('grp/proj'), 'mr', KEYS)
    expect(mrs.views.value).toHaveLength(0)
    expect(window.localStorage.getItem('lumen:saved-views:issue:grp/proj')).toContain('Bugs')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bunx vitest run src/shared/composables/useSavedViews.test.ts`
Expected: FAIL — `sameView` takes 2 args today; `useSavedViews` takes 1 arg; namespace key absent.

- [ ] **Step 3: Generalize the composable**

Edit `src/shared/composables/useSavedViews.ts`. Remove the import of `FILTER_KEYS`/`ViewSlice` from issues and define a local `ViewSlice`; thread `keys` through `sameView`/`pickSlice`; add `namespace` to the storage key:

```ts
import { useLocalStorage } from '@vueuse/core'
import { computed, type Ref } from 'vue'

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
    ? v.filter((x): x is string => typeof x === 'string').slice().sort()
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
  namespace: string,
  keys: readonly string[],
) {
  const stored = useLocalStorage<SavedView[]>(() => storageKey(namespace, fullPath.value), [])
  const views = computed(() => stored.value)

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
```

- [ ] **Step 4: Update the issue call site**

Edit `src/features/issues/composables/useIssueSavedViews.ts`: import `FILTER_KEYS` and `ViewSlice`, and call with the namespace + keys. Replace the `import` of `ViewSlice` to come from `useIssueFilters` (unchanged) and change the `useSavedViews(fullPath)` call:

```ts
import { FILTER_KEYS, type ViewSlice } from '@/features/issues/composables/useIssueFilters'
// ...
const savedViews = useSavedViews(fullPath, 'issue', FILTER_KEYS)
```

(Leave the rest of `useIssueSavedViews.ts` unchanged.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `bunx vitest run src/shared/composables/useSavedViews.test.ts src/features/issues`
Expected: PASS (saved-views + all issue tests green).

> Migration note: this changes the localStorage key from `lumen:saved-views:<path>` to `lumen:saved-views:issue:<path>`, so existing issue saved views reset. Acceptable for a single-user pre-release tool — note it in the commit body.

- [ ] **Step 6: Format and commit**

```bash
bun run format
git add src/shared/composables/useSavedViews.ts src/shared/composables/useSavedViews.test.ts src/features/issues/composables/useIssueSavedViews.ts
git commit -m "refactor(saved-views): parameterize by namespace + filter keys

Issue saved-view storage key gains an 'issue' namespace segment, resetting
existing saved views (acceptable pre-release). Enables MR saved views."
```

---

## Task 2: `lib/mrView.ts` — pure MR types, mapping, formatting

**Files:**
- Create: `src/features/merge_requests/lib/mrView.ts`
- Test: `src/features/merge_requests/lib/mrView.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/features/merge_requests/lib/mrView.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { toMrVars, mrStateLabel, MR_FILTER_KEYS, MR_SORT_OPTIONS, type MrFilters } from './mrView'

const base: MrFilters = {
  state: 'opened',
  labels: [],
  draft: 'any',
  sort: 'updated',
}

describe('MR_FILTER_KEYS', () => {
  it('lists the recognized filter keys', () => {
    expect(MR_FILTER_KEYS).toEqual([
      'state', 'label', 'author', 'assignee', 'reviewer', 'milestone', 'draft', 'sort', 'q',
    ])
  })
})

describe('toMrVars', () => {
  it('maps the default slice (opened, updated) to args', () => {
    expect(toMrVars(base)).toEqual({
      state: 'opened',
      sort: 'updated_desc',
      authorUsername: undefined,
      assigneeUsername: undefined,
      reviewerUsername: undefined,
      labelName: undefined,
      milestoneTitle: undefined,
      draft: undefined,
    })
  })
  it("omits state when 'all'", () => {
    expect(toMrVars({ ...base, state: 'all' }).state).toBeUndefined()
  })
  it('maps the draft tri-state to a boolean or undefined', () => {
    expect(toMrVars({ ...base, draft: 'draft' }).draft).toBe(true)
    expect(toMrVars({ ...base, draft: 'ready' }).draft).toBe(false)
    expect(toMrVars({ ...base, draft: 'any' }).draft).toBeUndefined()
  })
  it('passes usernames, labels, milestone, and sort through', () => {
    const v = toMrVars({
      ...base,
      author: 'ada',
      assignee: 'lin',
      reviewer: 'ray',
      labels: ['bug', 'ui'],
      milestone: 'v1',
      sort: 'merged',
    })
    expect(v).toMatchObject({
      authorUsername: 'ada',
      assigneeUsername: 'lin',
      reviewerUsername: 'ray',
      labelName: ['bug', 'ui'],
      milestoneTitle: 'v1',
      sort: 'merged_at_desc',
    })
  })
})

describe('mrStateLabel', () => {
  it('prefers draft over open for an open draft MR', () => {
    expect(mrStateLabel({ state: 'opened', draft: true })).toBe('draft')
    expect(mrStateLabel({ state: 'opened', draft: false })).toBe('open')
  })
  it('maps merged and closed/locked', () => {
    expect(mrStateLabel({ state: 'merged', draft: false })).toBe('merged')
    expect(mrStateLabel({ state: 'closed', draft: false })).toBe('closed')
    expect(mrStateLabel({ state: 'locked', draft: false })).toBe('closed')
  })
})

describe('MR_SORT_OPTIONS', () => {
  it('exposes the three sort keys with labels', () => {
    expect(MR_SORT_OPTIONS.map((o) => o.key)).toEqual(['updated', 'created', 'merged'])
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `bunx vitest run src/features/merge_requests/lib/mrView.test.ts`
Expected: FAIL — cannot resolve `./mrView`.

- [ ] **Step 3: Implement**

Create `src/features/merge_requests/lib/mrView.ts`:

```ts
export type MrState = 'opened' | 'merged' | 'closed' | 'all'
export type MrSortKey = 'updated' | 'created' | 'merged'
export type MrDraft = 'any' | 'draft' | 'ready'

// URL keys that make up the persisted, per-project MR view-state slice.
export const MR_FILTER_KEYS = [
  'state', 'label', 'author', 'assignee', 'reviewer', 'milestone', 'draft', 'sort', 'q',
] as const

export const MR_SORT_OPTIONS: { key: MrSortKey; label: string }[] = [
  { key: 'updated', label: 'Last updated' },
  { key: 'created', label: 'Created' },
  { key: 'merged', label: 'Merged' },
]

const SORT_ARG: Record<MrSortKey, string> = {
  updated: 'updated_desc',
  created: 'created_desc',
  merged: 'merged_at_desc',
}

/** Normalized filter inputs the composable exposes. */
export type MrFilters = {
  state: MrState
  labels: string[]
  author?: string
  assignee?: string
  reviewer?: string
  milestone?: string
  draft: MrDraft
  sort: MrSortKey
  search?: string
}

/** GraphQL variables for the list query (minus fullPath/after/search). */
export type MrQueryVars = {
  state?: Exclude<MrState, 'all'>
  sort: string
  authorUsername?: string
  assigneeUsername?: string
  reviewerUsername?: string
  labelName?: string[]
  milestoneTitle?: string
  draft?: boolean
}

export function toMrVars(f: MrFilters): MrQueryVars {
  return {
    state: f.state === 'all' ? undefined : f.state,
    sort: SORT_ARG[f.sort],
    authorUsername: f.author || undefined,
    assigneeUsername: f.assignee || undefined,
    reviewerUsername: f.reviewer || undefined,
    labelName: f.labels.length ? f.labels : undefined,
    milestoneTitle: f.milestone || undefined,
    draft: f.draft === 'any' ? undefined : f.draft === 'draft',
  }
}

/** Display state for an MR: draft takes precedence over open. */
export function mrStateLabel(mr: { state: string; draft: boolean }): 'draft' | 'open' | 'merged' | 'closed' {
  if (mr.state === 'merged') return 'merged'
  if (mr.state === 'closed' || mr.state === 'locked') return 'closed'
  return mr.draft ? 'draft' : 'open'
}

/** vue-query keys for the MR list and a single MR. */
export const mrListKey = (fullPath: string, vars: unknown) =>
  ['merge-requests', fullPath, vars] as const
export const mrKey = (fullPath: string, iid: string) => ['merge-request', fullPath, iid] as const

export const MR_POLL_MS = 30_000
```

- [ ] **Step 4: Run to verify it passes**

Run: `bunx vitest run src/features/merge_requests/lib/mrView.test.ts`
Expected: PASS.

- [ ] **Step 5: Format and commit**

```bash
bun run format
git add src/features/merge_requests/lib/mrView.ts src/features/merge_requests/lib/mrView.test.ts
git commit -m "feat(mr): pure mr view mapping, sort options, and query keys"
```

---

## Task 3: `useMrFilters` — URL-encoded filter slice

**Files:**
- Create: `src/features/merge_requests/composables/useMrFilters.ts`
- Test: `src/features/merge_requests/composables/useMrFilters.test.ts`

This mirrors `useIssueFilters` but with MR keys and no group/view/scope. Read `src/features/issues/composables/useIssueFilters.ts` for the URL round-trip + per-project persistence pattern before implementing; the structure below copies it faithfully.

- [ ] **Step 1: Write the failing test**

Create `src/features/merge_requests/composables/useMrFilters.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { createRouter, createMemoryHistory, type Router } from 'vue-router'
import { useMrFilters } from './useMrFilters'

function mountWith(initial: string): { api: ReturnType<typeof useMrFilters>; router: Router } {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/projects/:fullPath(.*)/merge-requests', name: 'merge-requests', component: { template: '<div/>' } }],
  })
  let api!: ReturnType<typeof useMrFilters>
  const Comp = defineComponent({
    setup() {
      api = useMrFilters()
      return () => h('div')
    },
  })
  router.push(initial)
  return { api, router: Object.assign(router, { _mount: mount(Comp, { global: { plugins: [router] } }) }) }
}

beforeEach(() => window.localStorage.clear())

describe('useMrFilters', () => {
  it('defaults to opened state, updated sort, any draft', async () => {
    const { api, router } = mountWith('/projects/grp/proj/merge-requests')
    await router.isReady()
    expect(api.state.value).toBe('opened')
    expect(api.sort.value).toBe('updated')
    expect(api.draft.value).toBe('any')
    expect(api.filters.value.state).toBe('opened')
  })

  it('reads reviewer/author/assignee/draft from the URL', async () => {
    const { api, router } = mountWith(
      '/projects/grp/proj/merge-requests?reviewer=ray&author=ada&assignee=lin&draft=draft&state=merged',
    )
    await router.isReady()
    expect(api.reviewer.value).toBe('ray')
    expect(api.author.value).toBe('ada')
    expect(api.assignee.value).toBe('lin')
    expect(api.draft.value).toBe('draft')
    expect(api.state.value).toBe('merged')
  })

  it('produces a viewSlice over the MR keys', async () => {
    const { api, router } = mountWith('/projects/grp/proj/merge-requests?reviewer=ray&sort=created')
    await router.isReady()
    expect(api.viewSlice.value).toMatchObject({ reviewer: 'ray', sort: 'created' })
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `bunx vitest run src/features/merge_requests/composables/useMrFilters.test.ts`
Expected: FAIL — cannot resolve `./useMrFilters`.

- [ ] **Step 3: Implement**

Create `src/features/merge_requests/composables/useMrFilters.ts`:

```ts
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
    patch({ label: undefined, author: undefined, assignee: undefined, reviewer: undefined, milestone: undefined })
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
    state, labels, author, assignee, reviewer, milestone, draft, sort, search,
    activeCount, toggleLabel, clearAll, filters, viewSlice, applyView,
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `bunx vitest run src/features/merge_requests/composables/useMrFilters.test.ts`
Expected: PASS.

- [ ] **Step 5: Format and commit**

```bash
bun run format
git add src/features/merge_requests/composables/useMrFilters.ts src/features/merge_requests/composables/useMrFilters.test.ts
git commit -m "feat(mr): url-encoded merge request filter slice"
```

---

## Task 4: `useMergeRequests` — list infinite query

**Files:**
- Create: `src/features/merge_requests/composables/useMergeRequests.ts`
- Test: `src/features/merge_requests/composables/useMergeRequests.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/features/merge_requests/composables/useMergeRequests.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import { withQuery } from '@/test/withQuery'
import type { MrFilters } from '@/features/merge_requests/lib/mrView'

const request = vi.fn()
vi.mock('@/gitlab/client', () => ({ gqlClient: { request: (...a: unknown[]) => request(...a) } }))

import { useMergeRequests } from './useMergeRequests'

const filters: MrFilters = { state: 'opened', labels: [], draft: 'any', sort: 'updated' }

beforeEach(() => request.mockReset())

describe('useMergeRequests', () => {
  it('returns flattened nodes and passes filter args through', async () => {
    request.mockResolvedValue({
      project: {
        mergeRequests: {
          nodes: [{ iid: '5', title: 'Add API', state: 'opened', draft: false }],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      },
    })
    const { result } = withQuery(() =>
      useMergeRequests(ref('grp/proj'), ref({ ...filters, reviewer: 'ray' })),
    )
    await flushPromises()
    expect(result().mergeRequests.value).toHaveLength(1)
    expect(result().mergeRequests.value[0].iid).toBe('5')
    // second positional arg to request() is the variables object
    expect(request.mock.calls[0][1]).toMatchObject({
      fullPath: 'grp/proj',
      state: 'opened',
      sort: 'updated_desc',
      reviewerUsername: 'ray',
    })
  })

  it('normalizes a missing connection to an empty list', async () => {
    request.mockResolvedValue({ project: null })
    const { result } = withQuery(() => useMergeRequests(ref('grp/proj'), ref(filters)))
    await flushPromises()
    expect(result().mergeRequests.value).toEqual([])
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `bunx vitest run src/features/merge_requests/composables/useMergeRequests.test.ts`
Expected: FAIL — cannot resolve `./useMergeRequests`.

- [ ] **Step 3: Implement**

Create `src/features/merge_requests/composables/useMergeRequests.ts`:

```ts
import { useInfiniteQuery } from '@tanstack/vue-query'
import { computed, type Ref } from 'vue'
import { gqlClient } from '@/gitlab/client'
import { normalizeError, type GitLabError } from '@/gitlab/errors'
import { MR_POLL_MS, mrListKey, toMrVars, type MrFilters } from '@/features/merge_requests/lib/mrView'

const MergeRequestsDocument = `
  query ProjectMergeRequests(
    $fullPath: ID!, $state: MergeRequestState, $sort: MergeRequestSort,
    $authorUsername: String, $assigneeUsername: String, $reviewerUsername: String,
    $labelName: [String!], $milestoneTitle: String, $draft: Boolean,
    $search: String, $after: String
  ) {
    project(fullPath: $fullPath) {
      mergeRequests(
        state: $state, sort: $sort, authorUsername: $authorUsername,
        assigneeUsername: $assigneeUsername, reviewerUsername: $reviewerUsername,
        labelName: $labelName, milestoneTitle: $milestoneTitle, draft: $draft,
        search: $search, first: 30, after: $after
      ) {
        pageInfo { hasNextPage endCursor }
        nodes {
          iid title state draft conflicts webUrl createdAt updatedAt mergedAt
          sourceBranch targetBranch approved approvalsRequired
          author { name username }
          assignees { nodes { name username } }
          reviewers { nodes { name username } }
          labels { nodes { id title color } }
          milestone { id title }
          headPipeline { id status }
        }
      }
    }
  }
`

type UserCore = { name?: string | null; username: string }
type LabelNode = { id: string; title: string; color: string }

export type MergeRequestListItem = {
  iid: string
  title: string
  state: string
  draft: boolean
  conflicts: boolean
  webUrl: string
  createdAt: string
  updatedAt: string
  mergedAt?: string | null
  sourceBranch: string
  targetBranch: string
  approved: boolean
  approvalsRequired?: number | null
  author?: UserCore | null
  assignees?: { nodes?: (UserCore | null)[] | null } | null
  reviewers?: { nodes?: (UserCore | null)[] | null } | null
  labels?: { nodes?: (LabelNode | null)[] | null } | null
  milestone?: { id: string; title: string } | null
  headPipeline?: { id: string; status: string } | null
}

type Result = {
  project?: {
    mergeRequests?: {
      pageInfo?: { hasNextPage: boolean; endCursor: string | null } | null
      nodes?: (MergeRequestListItem | null)[] | null
    } | null
  } | null
}

type Vars = ReturnType<typeof toMrVars> & {
  fullPath: string
  search?: string
  after?: string
}

async function fetchMrs(fullPath: string, filters: MrFilters, after?: string) {
  const vars: Vars = {
    fullPath,
    ...toMrVars(filters),
    search: filters.search || undefined,
    after,
  }
  try {
    const data = await gqlClient.request<Result, Vars>(MergeRequestsDocument, vars)
    return {
      nodes:
        data.project?.mergeRequests?.nodes?.filter((n): n is MergeRequestListItem => !!n) ?? [],
      pageInfo: data.project?.mergeRequests?.pageInfo ?? { hasNextPage: false, endCursor: null },
    }
  } catch (e) {
    throw normalizeError(e)
  }
}

type MrsPage = Awaited<ReturnType<typeof fetchMrs>>

export function useMergeRequests(fullPath: Ref<string>, filters: Ref<MrFilters>) {
  const query = useInfiniteQuery<MrsPage, GitLabError>({
    queryKey: computed(() => mrListKey(fullPath.value, filters.value)),
    queryFn: ({ pageParam }) =>
      fetchMrs(fullPath.value, filters.value, pageParam as string | undefined),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) =>
      last.pageInfo.hasNextPage ? (last.pageInfo.endCursor ?? undefined) : undefined,
    refetchInterval: MR_POLL_MS,
    refetchOnWindowFocus: true,
  })

  const mergeRequests = computed(() => query.data.value?.pages.flatMap((p) => p.nodes) ?? [])
  return Object.assign(query, { mergeRequests })
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `bunx vitest run src/features/merge_requests/composables/useMergeRequests.test.ts`
Expected: PASS.

- [ ] **Step 5: Format and commit**

```bash
bun run format
git add src/features/merge_requests/composables/useMergeRequests.ts src/features/merge_requests/composables/useMergeRequests.test.ts
git commit -m "feat(mr): merge request list infinite query"
```

---

## Task 5: `useMergeRequest` — detail query

**Files:**
- Create: `src/features/merge_requests/composables/useMergeRequest.ts`
- Test: `src/features/merge_requests/composables/useMergeRequest.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/features/merge_requests/composables/useMergeRequest.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import { withQuery } from '@/test/withQuery'

const request = vi.fn()
vi.mock('@/gitlab/client', () => ({ gqlClient: { request: (...a: unknown[]) => request(...a) } }))

import { useMergeRequest } from './useMergeRequest'

beforeEach(() => request.mockReset())

describe('useMergeRequest', () => {
  it('returns the MR with its discussions', async () => {
    request.mockResolvedValue({
      project: {
        mergeRequest: {
          id: 'gid://MR/1', iid: '5', title: 'Add API', state: 'opened', draft: false,
          descriptionHtml: '<p>hi</p>', sourceBranch: 'feat', targetBranch: 'main',
          approved: false, approvalsRequired: 1, conflicts: false, mergeableDiscussionsState: true,
          webUrl: '#', createdAt: 't', updatedAt: 't',
          author: { name: 'Ada', username: 'ada' },
          assignees: { nodes: [] }, reviewers: { nodes: [] }, labels: { nodes: [] },
          milestone: null, headPipeline: null,
          discussions: { nodes: [{ id: 'd1', notes: { nodes: [{ id: 'n1', body: 'hey', bodyHtml: '<p>hey</p>', system: false, createdAt: 't', author: { name: 'Ada', username: 'ada' } }] } }] },
        },
      },
    })
    const { result } = withQuery(() => useMergeRequest(ref('grp/proj'), ref('5')))
    await flushPromises()
    expect(result().data.value?.iid).toBe('5')
    expect(result().data.value?.discussions.nodes?.[0]?.id).toBe('d1')
  })

  it('normalizes errors', async () => {
    request.mockRejectedValue(new Error('boom'))
    const { result } = withQuery(() => useMergeRequest(ref('grp/proj'), ref('5')))
    await flushPromises()
    expect(result().error.value).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `bunx vitest run src/features/merge_requests/composables/useMergeRequest.test.ts`
Expected: FAIL — cannot resolve `./useMergeRequest`.

- [ ] **Step 3: Implement**

Create `src/features/merge_requests/composables/useMergeRequest.ts`:

```ts
import { useQuery } from '@tanstack/vue-query'
import { computed, type Ref } from 'vue'
import { gqlClient } from '@/gitlab/client'
import { normalizeError, type GitLabError } from '@/gitlab/errors'
import { MR_POLL_MS, mrKey } from '@/features/merge_requests/lib/mrView'

const MergeRequestDocument = `
  query MergeRequest($fullPath: ID!, $iid: String!) {
    project(fullPath: $fullPath) {
      mergeRequest(iid: $iid) {
        id iid title state draft conflicts webUrl createdAt updatedAt mergedAt
        descriptionHtml mergeableDiscussionsState
        sourceBranch targetBranch approved approvalsRequired
        author { name username }
        assignees { nodes { name username } }
        reviewers { nodes { name username } }
        labels { nodes { id title color } }
        milestone { id title }
        headPipeline { id status }
        discussions(first: 100) {
          nodes {
            id
            notes(first: 100) {
              nodes { id body bodyHtml system createdAt author { name username } }
            }
          }
        }
      }
    }
  }
`

type UserCore = { name?: string | null; username: string }
type Note = { id: string; body: string; bodyHtml?: string | null; system: boolean; createdAt: string; author?: UserCore | null }

export type MergeRequestDetail = {
  id: string
  iid: string
  title: string
  state: string
  draft: boolean
  conflicts: boolean
  webUrl: string
  createdAt: string
  updatedAt: string
  mergedAt?: string | null
  descriptionHtml?: string | null
  mergeableDiscussionsState?: boolean | null
  sourceBranch: string
  targetBranch: string
  approved: boolean
  approvalsRequired?: number | null
  author?: UserCore | null
  assignees?: { nodes?: (UserCore | null)[] | null } | null
  reviewers?: { nodes?: (UserCore | null)[] | null } | null
  labels?: { nodes?: ({ id: string; title: string; color: string } | null)[] | null } | null
  milestone?: { id: string; title: string } | null
  headPipeline?: { id: string; status: string } | null
  discussions: { nodes?: ({ id: string; notes: { nodes?: (Note | null)[] | null } } | null)[] | null }
}

type Result = { project?: { mergeRequest?: MergeRequestDetail | null } | null }

async function fetchMr(fullPath: string, iid: string): Promise<MergeRequestDetail | null> {
  try {
    const data = await gqlClient.request<Result, { fullPath: string; iid: string }>(
      MergeRequestDocument,
      { fullPath, iid },
    )
    return data.project?.mergeRequest ?? null
  } catch (e) {
    throw normalizeError(e)
  }
}

export function useMergeRequest(fullPath: Ref<string>, iid: Ref<string>) {
  return useQuery<MergeRequestDetail | null, GitLabError>({
    queryKey: computed(() => mrKey(fullPath.value, iid.value)),
    queryFn: () => fetchMr(fullPath.value, iid.value),
    refetchInterval: MR_POLL_MS,
    refetchOnWindowFocus: true,
  })
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `bunx vitest run src/features/merge_requests/composables/useMergeRequest.test.ts`
Expected: PASS.

- [ ] **Step 5: Format and commit**

```bash
bun run format
git add src/features/merge_requests/composables/useMergeRequest.ts src/features/merge_requests/composables/useMergeRequest.test.ts
git commit -m "feat(mr): merge request detail query with discussions"
```

---

## Task 6: `useMrDiscussion` — reply mutation

**Files:**
- Create: `src/features/merge_requests/composables/useMrDiscussion.ts`
- Test: `src/features/merge_requests/composables/useMrDiscussion.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/features/merge_requests/composables/useMrDiscussion.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { withQuery } from '@/test/withQuery'

const request = vi.fn()
vi.mock('@/gitlab/client', () => ({ gqlClient: { request: (...a: unknown[]) => request(...a) } }))

import { useMrAddNote } from './useMrDiscussion'

beforeEach(() => request.mockReset())

describe('useMrAddNote', () => {
  it('posts a reply with noteableId, discussionId, and body', async () => {
    request.mockResolvedValue({ createNote: { note: { id: 'n2' } } })
    const { result } = withQuery(() => useMrAddNote('grp/proj', '5'))
    await result().mutateAsync({ noteableId: 'gid://MR/1', discussionId: 'd1', body: 'looks good' })
    await flushPromises()
    expect(request.mock.calls[0][1]).toEqual({
      input: { noteableId: 'gid://MR/1', discussionId: 'd1', body: 'looks good' },
    })
  })

  it('surfaces a normalized error', async () => {
    request.mockRejectedValue(new Error('boom'))
    const { result } = withQuery(() => useMrAddNote('grp/proj', '5'))
    await expect(
      result().mutateAsync({ noteableId: 'x', discussionId: 'd', body: 'b' }),
    ).rejects.toBeTruthy()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `bunx vitest run src/features/merge_requests/composables/useMrDiscussion.test.ts`
Expected: FAIL — cannot resolve `./useMrDiscussion`.

- [ ] **Step 3: Implement**

Create `src/features/merge_requests/composables/useMrDiscussion.ts`:

```ts
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { gqlClient } from '@/gitlab/client'
import { normalizeError, type GitLabError } from '@/gitlab/errors'
import { mrKey } from '@/features/merge_requests/lib/mrView'

const CreateNoteDocument = `
  mutation CreateMrNote($input: CreateNoteInput!) {
    createNote(input: $input) {
      note { id }
      errors
    }
  }
`

type CreateNoteResult = { createNote?: { note?: { id: string } | null; errors?: string[] | null } | null }

/**
 * Reply within an MR discussion thread. `discussionId` makes the note a reply
 * within that thread; `noteableId` is the MR's global id. Invalidates the MR
 * detail query so the reply lands on the next refetch.
 */
export function useMrAddNote(fullPath: string, iid: string) {
  const qc = useQueryClient()
  return useMutation<
    CreateNoteResult['createNote'],
    GitLabError,
    { noteableId: string; discussionId: string; body: string }
  >({
    mutationFn: async (input) => {
      try {
        const data = await gqlClient.request<CreateNoteResult, { input: typeof input }>(
          CreateNoteDocument,
          { input },
        )
        return data.createNote ?? null
      } catch (e) {
        throw normalizeError(e)
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: mrKey(fullPath, iid) }),
  })
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `bunx vitest run src/features/merge_requests/composables/useMrDiscussion.test.ts`
Expected: PASS.

- [ ] **Step 5: Format and commit**

```bash
bun run format
git add src/features/merge_requests/composables/useMrDiscussion.ts src/features/merge_requests/composables/useMrDiscussion.test.ts
git commit -m "feat(mr): reply mutation for merge request discussions"
```

---

## Task 7: Router routes

**Files:**
- Modify: `src/router/index.ts`
- Test: `src/router/index.test.ts` (extend)

- [ ] **Step 1: Write the failing test**

Append to `src/router/index.test.ts`:

```ts
describe('merge request routes', () => {
  it('resolves the MR list and detail routes', () => {
    const router = createRouter({ history: createMemoryHistory(), routes })
    const list = router.resolve('/projects/grp/proj/merge-requests')
    expect(list.name).toBe('merge-requests')
    expect(list.params.fullPath).toBe('grp/proj')

    const detail = router.resolve('/projects/grp/proj/merge-requests/5')
    expect(detail.name).toBe('merge-request')
    const record = detail.matched.at(-1)!
    const props = (record.props.default as (r: typeof detail) => Record<string, unknown>)(detail)
    expect(props).toEqual({ fullPath: 'grp/proj', iid: '5' })
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `bunx vitest run src/router/index.test.ts`
Expected: FAIL — routes not registered.

- [ ] **Step 3: Implement**

Edit `src/router/index.ts`. Add the eager imports near the others:

```ts
import MergeRequestList from '@/views/MergeRequestList.vue'
import MergeRequestDetail from '@/views/MergeRequestDetail.vue'
```

Add these two route records to the `routes` array (place after the `pipelines` record):

```ts
  {
    path: '/projects/:fullPath(.*)/merge-requests',
    name: 'merge-requests',
    component: MergeRequestList,
    props: true,
  },
  {
    path: '/projects/:fullPath(.*)/merge-requests/:iid',
    name: 'merge-request',
    component: MergeRequestDetail,
    props: (route) => ({
      fullPath: route.params.fullPath,
      iid: route.params.iid,
    }),
  },
```

> The views don't exist yet (Tasks 11 & 13). To keep this task's test green without the views, create **minimal placeholder views** now and flesh them out in their tasks:
>
> Create `src/views/MergeRequestList.vue`:
> ```vue
> <script setup lang="ts">
> defineProps<{ fullPath: string }>()
> </script>
> <template><div /></template>
> ```
> Create `src/views/MergeRequestDetail.vue`:
> ```vue
> <script setup lang="ts">
> defineProps<{ fullPath: string; iid: string }>()
> </script>
> <template><div /></template>
> ```

- [ ] **Step 4: Run to verify it passes**

Run: `bunx vitest run src/router/index.test.ts`
Expected: PASS.

- [ ] **Step 5: Format and commit**

```bash
bun run format
git add src/router/index.ts src/router/index.test.ts src/views/MergeRequestList.vue src/views/MergeRequestDetail.vue
git commit -m "feat(mr): register merge request list + detail routes"
```

---

## Task 8: `MrStateBadge.vue`

**Files:**
- Create: `src/features/merge_requests/components/MrStateBadge.vue`
- Test: `src/features/merge_requests/components/MrStateBadge.test.ts`

Mirror `src/features/issues/components/StateBadge.vue` for styling conventions.

- [ ] **Step 1: Write the failing test**

Create `src/features/merge_requests/components/MrStateBadge.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import MrStateBadge from './MrStateBadge.vue'

describe('MrStateBadge', () => {
  it('shows Draft for an open draft MR', () => {
    const w = mount(MrStateBadge, { props: { state: 'opened', draft: true } })
    expect(w.text()).toBe('Draft')
  })
  it('shows Open / Merged / Closed', () => {
    expect(mount(MrStateBadge, { props: { state: 'opened', draft: false } }).text()).toBe('Open')
    expect(mount(MrStateBadge, { props: { state: 'merged', draft: false } }).text()).toBe('Merged')
    expect(mount(MrStateBadge, { props: { state: 'closed', draft: false } }).text()).toBe('Closed')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `bunx vitest run src/features/merge_requests/components/MrStateBadge.test.ts`
Expected: FAIL — component missing.

- [ ] **Step 3: Implement**

Create `src/features/merge_requests/components/MrStateBadge.vue`:

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { mrStateLabel } from '@/features/merge_requests/lib/mrView'

const props = defineProps<{ state: string; draft: boolean }>()

const kind = computed(() => mrStateLabel({ state: props.state, draft: props.draft }))
const label = computed(() => ({ draft: 'Draft', open: 'Open', merged: 'Merged', closed: 'Closed' })[kind.value])
const tone = computed(
  () =>
    ({
      draft: 'bg-muted text-muted-foreground ring-border',
      open: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30',
      merged: 'bg-violet-500/15 text-violet-300 ring-violet-500/30',
      closed: 'bg-rose-500/15 text-rose-300 ring-rose-500/30',
    })[kind.value],
)
</script>

<template>
  <span
    class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset"
    :class="tone"
  >
    {{ label }}
  </span>
</template>
```

- [ ] **Step 4: Run to verify it passes**

Run: `bunx vitest run src/features/merge_requests/components/MrStateBadge.test.ts`
Expected: PASS.

- [ ] **Step 5: Format and commit**

```bash
bun run format
git add src/features/merge_requests/components/MrStateBadge.vue src/features/merge_requests/components/MrStateBadge.test.ts
git commit -m "feat(mr): merge request state badge"
```

---

## Task 9: `MergeRequestRow.vue`

**Files:**
- Create: `src/features/merge_requests/components/MergeRequestRow.vue`
- Test: `src/features/merge_requests/components/MergeRequestRow.test.ts`

Mirror `src/features/issues/components/IssueRow.vue` for layout/classes.

- [ ] **Step 1: Write the failing test**

Create `src/features/merge_requests/components/MergeRequestRow.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { mount, RouterLinkStub } from '@vue/test-utils'
import MergeRequestRow from './MergeRequestRow.vue'
import type { MergeRequestListItem } from '@/features/merge_requests/composables/useMergeRequests'

const mr: MergeRequestListItem = {
  iid: '5', title: 'Add API', state: 'opened', draft: true, conflicts: false, webUrl: '#',
  createdAt: 't', updatedAt: 't', mergedAt: null, sourceBranch: 'feat/api', targetBranch: 'main',
  approved: false, approvalsRequired: 2,
  author: { name: 'Ada', username: 'ada' },
  assignees: { nodes: [] }, reviewers: { nodes: [{ name: 'Ray', username: 'ray' }] },
  labels: { nodes: [] }, milestone: null, headPipeline: null,
}

function mountRow() {
  return mount(MergeRequestRow, {
    props: { mr, fullPath: 'grp/proj' },
    global: { stubs: { RouterLink: RouterLinkStub } },
  })
}

describe('MergeRequestRow', () => {
  it('renders title, branches and the draft badge', () => {
    const w = mountRow()
    expect(w.text()).toContain('Add API')
    expect(w.text()).toContain('feat/api')
    expect(w.text()).toContain('main')
    expect(w.text()).toContain('Draft')
  })

  it('links to the MR detail route', () => {
    const link = mountRow().findComponent(RouterLinkStub)
    expect(link.props('to')).toEqual({ name: 'merge-request', params: { fullPath: 'grp/proj', iid: '5' } })
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `bunx vitest run src/features/merge_requests/components/MergeRequestRow.test.ts`
Expected: FAIL — component missing.

- [ ] **Step 3: Implement**

Create `src/features/merge_requests/components/MergeRequestRow.vue`:

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { GitMerge, ArrowRight } from '@lucide/vue'
import MrStateBadge from '@/features/merge_requests/components/MrStateBadge.vue'
import type { MergeRequestListItem } from '@/features/merge_requests/composables/useMergeRequests'

const props = defineProps<{ mr: MergeRequestListItem; fullPath: string }>()

const reviewers = computed(
  () => props.mr.reviewers?.nodes?.filter((n): n is { name?: string | null; username: string } => !!n) ?? [],
)
const approvals = computed(() =>
  props.mr.approvalsRequired ? `${props.mr.approved ? '✓' : ''}${props.mr.approvalsRequired} approvals` : null,
)
</script>

<template>
  <RouterLink
    :to="{ name: 'merge-request', params: { fullPath, iid: mr.iid } }"
    class="flex items-center gap-3 rounded-md px-3 py-2.5 outline-none hover:bg-accent/50 focus-visible:ring-1 focus-visible:ring-ring/50"
  >
    <GitMerge class="size-4 shrink-0 text-muted-foreground" />
    <div class="min-w-0 flex-1">
      <div class="flex items-center gap-2">
        <span class="truncate text-sm font-medium text-foreground">{{ mr.title }}</span>
        <MrStateBadge :state="mr.state" :draft="mr.draft" />
      </div>
      <div class="mt-0.5 flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
        <span class="font-medium">!{{ mr.iid }}</span>
        <span class="truncate">{{ mr.sourceBranch }}</span>
        <ArrowRight class="size-3 shrink-0" />
        <span class="truncate">{{ mr.targetBranch }}</span>
      </div>
    </div>
    <div class="hidden shrink-0 items-center gap-3 text-xs text-muted-foreground sm:flex">
      <span v-if="approvals">{{ approvals }}</span>
      <span v-if="reviewers.length">{{ reviewers.length }} reviewer{{ reviewers.length > 1 ? 's' : '' }}</span>
    </div>
  </RouterLink>
</template>
```

> Verify `GitMerge` and `ArrowRight` are exported by `@lucide/vue` (they are in the installed version). If a name differs, pick the nearest existing icon already used in the repo.

- [ ] **Step 4: Run to verify it passes**

Run: `bunx vitest run src/features/merge_requests/components/MergeRequestRow.test.ts`
Expected: PASS.

- [ ] **Step 5: Format and commit**

```bash
bun run format
git add src/features/merge_requests/components/MergeRequestRow.vue src/features/merge_requests/components/MergeRequestRow.test.ts
git commit -m "feat(mr): merge request list row"
```

---

## Task 10: List chrome — header, toolbar, filter panel

**Files:**
- Create: `src/features/merge_requests/components/MergeRequestListHeader.vue`
- Create: `src/features/merge_requests/components/MergeRequestListToolbar.vue`
- Create: `src/features/merge_requests/components/MrFilterPanel.vue`
- Test: `src/features/merge_requests/components/MergeRequestListHeader.test.ts`

These are presentational; mirror `IssueListHeader.vue`, `IssueListToolbar.vue`, and `IssueFilterPanel.vue` for structure and classes. Only the header gets a focused test (nav correctness); the toolbar/panel are exercised via the list view test in Task 11.

- [ ] **Step 1: Write the failing test (header)**

Create `src/features/merge_requests/components/MergeRequestListHeader.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { mount, RouterLinkStub } from '@vue/test-utils'
import MergeRequestListHeader from './MergeRequestListHeader.vue'

function mountHeader() {
  return mount(MergeRequestListHeader, {
    props: { fullPath: 'grp/proj', repoName: 'proj', count: 3 },
    global: { stubs: { RouterLink: RouterLinkStub } },
  })
}

describe('MergeRequestListHeader', () => {
  it('renders the repo name and a link back to issues', () => {
    const w = mountHeader()
    expect(w.text()).toContain('proj')
    const links = w.findAllComponents(RouterLinkStub).map((l) => l.props('to'))
    expect(links).toContainEqual({ name: 'issues', params: { fullPath: 'grp/proj' } })
    expect(links).toContainEqual({ name: 'projects' })
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `bunx vitest run src/features/merge_requests/components/MergeRequestListHeader.test.ts`
Expected: FAIL — component missing.

- [ ] **Step 3: Implement the three components**

Create `src/features/merge_requests/components/MergeRequestListHeader.vue`:

```vue
<script setup lang="ts">
import { ArrowLeft, FileText, Workflow } from '@lucide/vue'
import { Button } from '@/shared/ui/button'
import { useTabNav } from '@/shared/composables/useTabNav'

defineProps<{ fullPath: string; repoName: string; count: number }>()
const { onTabNav } = useTabNav()
</script>

<template>
  <div class="flex items-end justify-between gap-4">
    <div class="min-w-0">
      <p class="font-mono text-micro font-semibold tracking-[0.28em] text-muted-foreground/80 uppercase">
        Merge Requests
      </p>
      <RouterLink
        :to="{ name: 'projects' }"
        class="group/back -ml-1 mt-2 flex max-w-full items-center gap-2 rounded-md px-1 outline-none focus-visible:ring-1 focus-visible:ring-ring/50"
      >
        <ArrowLeft class="size-5 shrink-0 text-primary transition-transform group-hover/back:-translate-x-0.5" />
        <h1 class="min-w-0 truncate text-title leading-none font-semibold text-foreground">{{ repoName }}</h1>
      </RouterLink>
    </div>
    <div class="flex shrink-0 items-center gap-3">
      <Button variant="outline" as-child>
        <RouterLink
          :to="{ name: 'issues', params: { fullPath } }"
          @click="onTabNav($event, { name: 'issues', params: { fullPath } })"
        >
          <FileText /> Issues
        </RouterLink>
      </Button>
      <Button variant="outline" as-child>
        <RouterLink
          :to="{ name: 'pipelines', params: { fullPath } }"
          @click="onTabNav($event, { name: 'pipelines', params: { fullPath } })"
        >
          <Workflow /> Pipelines
        </RouterLink>
      </Button>
    </div>
  </div>
</template>
```

Create `src/features/merge_requests/components/MrFilterPanel.vue` (state, draft, author/assignee/reviewer, milestone, label controls). Use plain selects + text inputs for usernames/milestone in v1 (the assignee/label flyouts can be wired later); this keeps the panel self-contained and testable:

```vue
<script setup lang="ts">
import type { MrDraft, MrState } from '@/features/merge_requests/lib/mrView'
import { Input } from '@/shared/ui/input'

const state = defineModel<MrState>('state', { required: true })
const draft = defineModel<MrDraft>('draft', { required: true })
const author = defineModel<string>('author', { required: true })
const assignee = defineModel<string>('assignee', { required: true })
const reviewer = defineModel<string>('reviewer', { required: true })
const milestone = defineModel<string>('milestone', { required: true })
</script>

<template>
  <div class="flex flex-wrap items-center gap-2">
    <select v-model="state" aria-label="State" class="rounded-md border border-border bg-background px-2 py-1 text-sm">
      <option value="opened">Open</option>
      <option value="merged">Merged</option>
      <option value="closed">Closed</option>
      <option value="all">All</option>
    </select>
    <select v-model="draft" aria-label="Draft" class="rounded-md border border-border bg-background px-2 py-1 text-sm">
      <option value="any">Any</option>
      <option value="draft">Draft</option>
      <option value="ready">Ready</option>
    </select>
    <Input v-model="author" placeholder="author" aria-label="Author username" class="h-8 w-32" />
    <Input v-model="assignee" placeholder="assignee" aria-label="Assignee username" class="h-8 w-32" />
    <Input v-model="reviewer" placeholder="reviewer" aria-label="Reviewer username" class="h-8 w-32" />
    <Input v-model="milestone" placeholder="milestone" aria-label="Milestone title" class="h-8 w-32" />
  </div>
</template>
```

Create `src/features/merge_requests/components/MergeRequestListToolbar.vue` (search input + sort select + saved-views trigger). Reuse the existing `SavedViews.vue` shared component:

```vue
<script setup lang="ts">
import { Search } from '@lucide/vue'
import { Input } from '@/shared/ui/input'
import SavedViews from '@/shared/components/SavedViews.vue'
import { MR_SORT_OPTIONS, type MrSortKey } from '@/features/merge_requests/lib/mrView'
import type { SavedView } from '@/shared/composables/useSavedViews'

defineProps<{
  views: SavedView[]
  activeId: string | null
  loadedId: string | null
  canSave: boolean
}>()
const emit = defineEmits<{
  apply: [view: SavedView]
  save: [name: string]
  update: [id: string]
  rename: [id: string, name: string]
  remove: [id: string]
}>()

const search = defineModel<string>('search', { required: true })
const sort = defineModel<MrSortKey>('sort', { required: true })
</script>

<template>
  <div class="flex flex-wrap items-center gap-2">
    <div class="flex min-w-48 flex-1 items-center gap-2 rounded-md border border-border px-2">
      <Search class="size-4 shrink-0 text-muted-foreground" />
      <Input v-model="search" type="search" placeholder="Search merge requests…" aria-label="Search merge requests" class="h-8 border-0 px-0 shadow-none focus-visible:ring-0" />
    </div>
    <select v-model="sort" aria-label="Sort" class="rounded-md border border-border bg-background px-2 py-1 text-sm">
      <option v-for="o in MR_SORT_OPTIONS" :key="o.key" :value="o.key">{{ o.label }}</option>
    </select>
    <SavedViews
      :views="views"
      :active-id="activeId"
      :loaded-id="loadedId"
      :can-save="canSave"
      @apply="emit('apply', $event)"
      @save="emit('save', $event)"
      @update="emit('update', $event)"
      @rename="(id, name) => emit('rename', id, name)"
      @remove="emit('remove', $event)"
    />
  </div>
</template>
```

> Before implementing the toolbar, open `src/shared/components/SavedViews.vue` and confirm its prop names (`views`, `active-id`, `loaded-id`, `can-save`) and emit signatures match the bindings above; adjust if the component's API differs.

- [ ] **Step 4: Run to verify the header test passes**

Run: `bunx vitest run src/features/merge_requests/components/MergeRequestListHeader.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck, format, commit**

```bash
bun run typecheck
bun run format
git add src/features/merge_requests/components/MergeRequestListHeader.vue src/features/merge_requests/components/MergeRequestListToolbar.vue src/features/merge_requests/components/MrFilterPanel.vue src/features/merge_requests/components/MergeRequestListHeader.test.ts
git commit -m "feat(mr): list header, toolbar, and filter panel"
```

---

## Task 11: `MergeRequestList.vue` view

**Files:**
- Modify (replace placeholder): `src/views/MergeRequestList.vue`
- Test: `src/views/MergeRequestList.test.ts`

Wires filters → query → list, saved views, and infinite scroll. Mirror `src/views/IssueList.vue` for the overall composition (loading/empty/error states, `useInfiniteScroll` or sentinel). Keep it focused.

- [ ] **Step 1: Write the failing test**

Create `src/views/MergeRequestList.test.ts`. Mock the data composables so the test verifies wiring + render:

```ts
import { describe, it, expect, vi } from 'vitest'
import { mount, RouterLinkStub, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'

vi.mock('@/features/merge_requests/composables/useMrFilters', () => ({
  useMrFilters: () => ({
    state: ref('opened'), labels: ref([]), author: ref(''), assignee: ref(''),
    reviewer: ref(''), milestone: ref(''), draft: ref('any'), sort: ref('updated'),
    search: ref(''), activeCount: ref(0), toggleLabel: () => {}, clearAll: () => {},
    filters: ref({ state: 'opened', labels: [], draft: 'any', sort: 'updated' }),
    viewSlice: ref({}), applyView: () => {},
  }),
}))
vi.mock('@/features/merge_requests/composables/useMergeRequests', () => ({
  useMergeRequests: () => ({
    mergeRequests: ref([
      { iid: '5', title: 'Add API', state: 'opened', draft: false, conflicts: false, webUrl: '#',
        createdAt: 't', updatedAt: 't', mergedAt: null, sourceBranch: 'feat', targetBranch: 'main',
        approved: false, approvalsRequired: null, author: { name: 'Ada', username: 'ada' },
        assignees: { nodes: [] }, reviewers: { nodes: [] }, labels: { nodes: [] }, milestone: null, headPipeline: null },
    ]),
    isLoading: ref(false), isFetching: ref(false), error: ref(null),
    hasNextPage: ref(false), fetchNextPage: () => {}, isFetchingNextPage: ref(false),
  }),
}))
vi.mock('@/features/issues/composables/useIssueSavedViews', () => ({
  useIssueSavedViews: () => ({
    savedViews: { views: ref([]) }, activeViewId: ref(null), canSaveView: ref(false),
    loadedViewId: ref(null), loadView: () => {}, saveCurrentView: () => {}, updateView: () => {}, removeView: () => {},
  }),
}))

import MergeRequestList from './MergeRequestList.vue'

describe('MergeRequestList', () => {
  it('renders MR rows for the project', async () => {
    const w = mount(MergeRequestList, {
      props: { fullPath: 'grp/proj' },
      global: { stubs: { RouterLink: RouterLinkStub } },
    })
    await flushPromises()
    expect(w.text()).toContain('Add API')
    expect(w.text()).toContain('feat')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `bunx vitest run src/views/MergeRequestList.test.ts`
Expected: FAIL — the placeholder renders an empty `<div/>`, so "Add API" is absent.

- [ ] **Step 3: Implement the view**

Replace `src/views/MergeRequestList.vue` with:

```vue
<script setup lang="ts">
import { computed, toRef } from 'vue'
import { useMrFilters } from '@/features/merge_requests/composables/useMrFilters'
import { useMergeRequests } from '@/features/merge_requests/composables/useMergeRequests'
import { useIssueSavedViews } from '@/features/issues/composables/useIssueSavedViews'
import MergeRequestListHeader from '@/features/merge_requests/components/MergeRequestListHeader.vue'
import MergeRequestListToolbar from '@/features/merge_requests/components/MergeRequestListToolbar.vue'
import MrFilterPanel from '@/features/merge_requests/components/MrFilterPanel.vue'
import MergeRequestRow from '@/features/merge_requests/components/MergeRequestRow.vue'
import ErrorNotice from '@/shared/components/ErrorNotice.vue'

const props = defineProps<{ fullPath: string }>()
const fullPath = toRef(props, 'fullPath')

const f = useMrFilters()
const { mergeRequests, isLoading, error, hasNextPage, fetchNextPage, isFetchingNextPage } =
  useMergeRequests(fullPath, f.filters)

const repoName = computed(() => props.fullPath.split('/').pop() ?? props.fullPath)

const saved = useIssueSavedViews(fullPath, f.viewSlice, f.applyView)
</script>

<template>
  <div class="mx-auto w-full max-w-4xl px-6 py-8">
    <MergeRequestListHeader :full-path="fullPath" :repo-name="repoName" :count="mergeRequests.length" />

    <div class="mt-6 space-y-3">
      <MergeRequestListToolbar
        v-model:search="f.search.value"
        v-model:sort="f.sort.value"
        :views="saved.savedViews.views.value"
        :active-id="saved.activeViewId.value"
        :loaded-id="saved.loadedViewId.value"
        :can-save="saved.canSaveView.value"
        @apply="saved.loadView"
        @save="saved.saveCurrentView"
        @update="saved.updateView"
        @rename="(id, name) => saved.savedViews.rename(id, name)"
        @remove="saved.removeView"
      />
      <MrFilterPanel
        v-model:state="f.state.value"
        v-model:draft="f.draft.value"
        v-model:author="f.author.value"
        v-model:assignee="f.assignee.value"
        v-model:reviewer="f.reviewer.value"
        v-model:milestone="f.milestone.value"
      />
    </div>

    <ErrorNotice v-if="error" :error="error" class="mt-6" />

    <div v-else-if="isLoading" class="mt-6 text-sm text-muted-foreground">Loading…</div>

    <p v-else-if="!mergeRequests.length" class="mt-16 text-center text-sm text-muted-foreground">
      No merge requests match these filters.
    </p>

    <ul v-else class="mt-4 divide-y divide-border/60">
      <li v-for="mr in mergeRequests" :key="mr.iid">
        <MergeRequestRow :mr="mr" :full-path="fullPath" />
      </li>
    </ul>

    <div v-if="hasNextPage" class="mt-4 flex justify-center">
      <button
        type="button"
        class="rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent/50 disabled:opacity-50"
        :disabled="isFetchingNextPage"
        @click="fetchNextPage()"
      >
        {{ isFetchingNextPage ? 'Loading…' : 'Load more' }}
      </button>
    </div>
  </div>
</template>
```

> `ErrorNotice` is the existing shared error component used by the issue views — confirm its prop name (`error`) against `src/shared/components/ErrorNotice.vue` and adjust if needed. `useIssueSavedViews` is generic over the slice type, so it works for MR slices; it persists under the issue namespace by default — change its `useSavedViews(fullPath, 'issue', …)` call only if you want a dedicated MR namespace. For v1, pass MR views through a dedicated namespace by using `useSavedViews(fullPath, 'mr', MR_FILTER_KEYS)` directly here instead of `useIssueSavedViews` if you prefer; the simplest correct path is to add a thin `useMrSavedViews` mirroring `useIssueSavedViews` but calling `useSavedViews(fullPath, 'mr', MR_FILTER_KEYS)`. **Implement `useMrSavedViews`** in `src/features/merge_requests/composables/useMrSavedViews.ts` (copy `useIssueSavedViews.ts`, swap the `useSavedViews` call args and the `ViewSlice` import to `@/shared/composables/useSavedViews`) and use it here, so MR saved views get their own namespace.

- [ ] **Step 4: Create `useMrSavedViews` and switch the view to it**

Create `src/features/merge_requests/composables/useMrSavedViews.ts`:

```ts
import { computed, ref, watch, type Ref } from 'vue'
import { useSavedViews, type ViewSlice } from '@/shared/composables/useSavedViews'
import { MR_FILTER_KEYS } from '@/features/merge_requests/lib/mrView'

export function useMrSavedViews<Slice extends ViewSlice>(
  fullPath: Ref<string>,
  viewSlice: Ref<Slice>,
  applyView: (query: Slice) => void,
) {
  const savedViews = useSavedViews(fullPath, 'mr', MR_FILTER_KEYS)
  const activeViewId = computed(() => savedViews.activeId(viewSlice.value))
  const canSaveView = computed(() => Object.keys(viewSlice.value).length > 0)
  const loadedViewId = ref<string | null>(null)
  watch(fullPath, () => (loadedViewId.value = null))

  function loadView(view: { id: string; query: Slice }) {
    applyView(view.query)
    loadedViewId.value = view.id
  }
  function saveCurrentView(name: string) {
    loadedViewId.value = savedViews.add(name, viewSlice.value)?.id ?? null
  }
  function updateView(id: string) {
    savedViews.update(id, viewSlice.value)
  }
  function removeView(id: string) {
    savedViews.remove(id)
    if (loadedViewId.value === id) loadedViewId.value = null
  }

  return { savedViews, activeViewId, canSaveView, loadedViewId, loadView, saveCurrentView, updateView, removeView }
}
```

Then in `MergeRequestList.vue` replace the `useIssueSavedViews` import + call with `useMrSavedViews` (same signature), and update the test's mock path from `@/features/issues/composables/useIssueSavedViews` to `@/features/merge_requests/composables/useMrSavedViews` (same shape).

- [ ] **Step 5: Run to verify it passes**

Run: `bunx vitest run src/views/MergeRequestList.test.ts`
Expected: PASS.

- [ ] **Step 6: Typecheck, format, commit**

```bash
bun run typecheck
bun run format
git add src/views/MergeRequestList.vue src/views/MergeRequestList.test.ts src/features/merge_requests/composables/useMrSavedViews.ts
git commit -m "feat(mr): merge request list view with filters and saved views"
```

---

## Task 12: Detail pieces — rail + discussion

**Files:**
- Create: `src/features/merge_requests/components/MergeRequestDetailRail.vue`
- Create: `src/features/merge_requests/components/MrDiscussion.vue`
- Test: `src/features/merge_requests/components/MergeRequestDetailRail.test.ts`

Mirror `IssueDetailsRail.vue` (rail styling) and the thread structure of `IssueDiscussion.vue`.

- [ ] **Step 1: Write the failing test (rail)**

Create `src/features/merge_requests/components/MergeRequestDetailRail.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import MergeRequestDetailRail from './MergeRequestDetailRail.vue'

const mr = {
  sourceBranch: 'feat/api', targetBranch: 'main', approved: false, approvalsRequired: 2,
  conflicts: true, mergeableDiscussionsState: true,
  reviewers: { nodes: [{ name: 'Ray', username: 'ray' }] },
  assignees: { nodes: [] }, labels: { nodes: [] }, milestone: { id: 'm1', title: 'v1' },
  headPipeline: { id: 'p1', status: 'SUCCESS' },
}

describe('MergeRequestDetailRail', () => {
  it('shows branches, approvals, reviewers, milestone and a conflicts note', () => {
    const w = mount(MergeRequestDetailRail, { props: { mr }, global: { stubs: { PipelineStatusBadge: true } } })
    expect(w.text()).toContain('feat/api')
    expect(w.text()).toContain('main')
    expect(w.text()).toContain('v1')
    expect(w.text()).toContain('Ray')
    expect(w.text().toLowerCase()).toContain('conflict')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `bunx vitest run src/features/merge_requests/components/MergeRequestDetailRail.test.ts`
Expected: FAIL — component missing.

- [ ] **Step 3: Implement the rail**

Create `src/features/merge_requests/components/MergeRequestDetailRail.vue`:

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { GitBranch, TriangleAlert } from '@lucide/vue'
import PipelineStatusBadge from '@/features/pipelines/components/PipelineStatusBadge.vue'

type UserCore = { name?: string | null; username: string }
const props = defineProps<{
  mr: {
    sourceBranch: string
    targetBranch: string
    approved: boolean
    approvalsRequired?: number | null
    conflicts: boolean
    mergeableDiscussionsState?: boolean | null
    reviewers?: { nodes?: (UserCore | null)[] | null } | null
    assignees?: { nodes?: (UserCore | null)[] | null } | null
    labels?: { nodes?: ({ id: string; title: string; color: string } | null)[] | null } | null
    milestone?: { id: string; title: string } | null
    headPipeline?: { id: string; status: string } | null
  }
}>()

const reviewers = computed(() => props.mr.reviewers?.nodes?.filter((n): n is UserCore => !!n) ?? [])
const assignees = computed(() => props.mr.assignees?.nodes?.filter((n): n is UserCore => !!n) ?? [])
const labels = computed(
  () => props.mr.labels?.nodes?.filter((n): n is { id: string; title: string; color: string } => !!n) ?? [],
)
const nameOf = (u: UserCore) => u.name || u.username
</script>

<template>
  <aside class="space-y-5 text-sm">
    <section>
      <h3 class="mb-1 font-mono text-xs tracking-wide text-muted-foreground uppercase">Branches</h3>
      <div class="flex items-center gap-1.5 font-mono text-xs">
        <GitBranch class="size-3.5 text-muted-foreground" />
        <span class="truncate">{{ mr.sourceBranch }}</span>
        <span class="text-muted-foreground">→</span>
        <span class="truncate">{{ mr.targetBranch }}</span>
      </div>
    </section>

    <section v-if="mr.approvalsRequired">
      <h3 class="mb-1 font-mono text-xs tracking-wide text-muted-foreground uppercase">Approvals</h3>
      <p>{{ mr.approved ? 'Approved' : 'Not approved' }} · {{ mr.approvalsRequired }} required</p>
    </section>

    <section v-if="reviewers.length">
      <h3 class="mb-1 font-mono text-xs tracking-wide text-muted-foreground uppercase">Reviewers</h3>
      <ul><li v-for="r in reviewers" :key="r.username">{{ nameOf(r) }}</li></ul>
    </section>

    <section v-if="assignees.length">
      <h3 class="mb-1 font-mono text-xs tracking-wide text-muted-foreground uppercase">Assignees</h3>
      <ul><li v-for="a in assignees" :key="a.username">{{ nameOf(a) }}</li></ul>
    </section>

    <section v-if="labels.length">
      <h3 class="mb-1 font-mono text-xs tracking-wide text-muted-foreground uppercase">Labels</h3>
      <div class="flex flex-wrap gap-1">
        <span v-for="l in labels" :key="l.id" class="rounded px-1.5 py-0.5 text-xs ring-1 ring-inset ring-border">{{ l.title }}</span>
      </div>
    </section>

    <section v-if="mr.milestone">
      <h3 class="mb-1 font-mono text-xs tracking-wide text-muted-foreground uppercase">Milestone</h3>
      <p>{{ mr.milestone.title }}</p>
    </section>

    <section v-if="mr.headPipeline">
      <h3 class="mb-1 font-mono text-xs tracking-wide text-muted-foreground uppercase">Pipeline</h3>
      <PipelineStatusBadge :status="mr.headPipeline.status" />
    </section>

    <p v-if="mr.conflicts" class="flex items-center gap-1.5 text-xs text-rose-300">
      <TriangleAlert class="size-3.5" /> Has conflicts
    </p>
  </aside>
</template>
```

> Confirm `PipelineStatusBadge.vue`'s prop name (`status`) — see `src/features/pipelines/components/PipelineStatusBadge.vue` — and that `GitBranch`/`TriangleAlert` are exported by `@lucide/vue`; substitute the nearest existing icon if a name differs.

Create `src/features/merge_requests/components/MrDiscussion.vue` (render threads; one reply box at a time). Uses `MarkdownText` for note bodies and a plain `Textarea` for replies (no @mentions in v1):

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { Button } from '@/shared/ui/button'
import { Textarea } from '@/shared/ui/textarea'
import MarkdownText from '@/shared/components/MarkdownText.vue'
import ErrorNotice from '@/shared/components/ErrorNotice.vue'
import { useMrAddNote } from '@/features/merge_requests/composables/useMrDiscussion'

type NoteAuthor = { name?: string | null; username: string } | null | undefined
type Note = { id: string; body: string; system: boolean; createdAt: string; author?: NoteAuthor }
type Thread = { id: string; notes: Note[] }

const props = defineProps<{
  threads: Thread[]
  fullPath: string
  iid: string
  mrId: string
}>()

const reply = useMrAddNote(props.fullPath, props.iid)
const replyingTo = ref<string | null>(null)
const body = ref('')

function open(threadId: string) {
  replyingTo.value = threadId
  body.value = ''
  reply.reset()
}
function cancel() {
  replyingTo.value = null
  body.value = ''
}
async function submit(threadId: string) {
  const text = body.value.trim()
  if (!text || reply.isPending.value) return
  try {
    await reply.mutateAsync({ noteableId: props.mrId, discussionId: threadId, body: text })
    cancel()
  } catch {
    /* error surfaces below; keep the box open */
  }
}
const nameOf = (a: NoteAuthor) => a?.name || a?.username || 'unknown'
</script>

<template>
  <div class="space-y-6">
    <div v-for="thread in threads" :key="thread.id" class="rounded-lg border border-border/60 p-3">
      <div v-for="note in thread.notes" :key="note.id" class="mb-3 last:mb-0">
        <p class="text-xs text-muted-foreground">{{ nameOf(note.author) }}</p>
        <MarkdownText :source="note.body" class="prose-sm" />
      </div>

      <div v-if="replyingTo === thread.id" class="mt-2 space-y-2">
        <Textarea v-model="body" rows="3" placeholder="Reply…" aria-label="Reply" />
        <ErrorNotice v-if="reply.error.value" :error="reply.error.value" />
        <div class="flex gap-2">
          <Button size="sm" :disabled="reply.isPending.value" @click="submit(thread.id)">
            {{ reply.isPending.value ? 'Posting…' : 'Reply' }}
          </Button>
          <Button size="sm" variant="ghost" @click="cancel">Cancel</Button>
        </div>
      </div>
      <Button v-else size="sm" variant="ghost" class="mt-1" @click="open(thread.id)">Reply</Button>
    </div>
  </div>
</template>
```

> Confirm `MarkdownText.vue`'s prop name (`source`) and that `@/shared/ui/textarea` exports `Textarea`; both are used by the issue views. Adjust if the API differs.

- [ ] **Step 4: Run to verify the rail test passes**

Run: `bunx vitest run src/features/merge_requests/components/MergeRequestDetailRail.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck, format, commit**

```bash
bun run typecheck
bun run format
git add src/features/merge_requests/components/MergeRequestDetailRail.vue src/features/merge_requests/components/MrDiscussion.vue src/features/merge_requests/components/MergeRequestDetailRail.test.ts
git commit -m "feat(mr): merge request detail rail and discussion"
```

---

## Task 13: `MergeRequestDetail.vue` view

**Files:**
- Modify (replace placeholder): `src/views/MergeRequestDetail.vue`
- Test: `src/views/MergeRequestDetail.test.ts`

Mirror `src/views/IssueDetail.vue` for masthead + body + rail composition.

- [ ] **Step 1: Write the failing test**

Create `src/views/MergeRequestDetail.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { mount, RouterLinkStub, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'

vi.mock('@/features/merge_requests/composables/useMergeRequest', () => ({
  useMergeRequest: () => ({
    data: ref({
      id: 'gid://MR/1', iid: '5', title: 'Add API', state: 'opened', draft: false,
      descriptionHtml: '<p>Adds the API</p>', sourceBranch: 'feat', targetBranch: 'main',
      approved: false, approvalsRequired: 1, conflicts: false, mergeableDiscussionsState: true,
      webUrl: 'https://gl/mr/5', createdAt: 't', updatedAt: 't',
      author: { name: 'Ada', username: 'ada' },
      assignees: { nodes: [] }, reviewers: { nodes: [] }, labels: { nodes: [] },
      milestone: null, headPipeline: null,
      discussions: { nodes: [{ id: 'd1', notes: { nodes: [{ id: 'n1', body: 'nice', system: false, createdAt: 't', author: { name: 'Ada', username: 'ada' } }] } }] },
    }),
    isLoading: ref(false), error: ref(null),
  }),
}))

import MergeRequestDetail from './MergeRequestDetail.vue'

describe('MergeRequestDetail', () => {
  it('renders the MR title, description and a thread', async () => {
    const w = mount(MergeRequestDetail, {
      props: { fullPath: 'grp/proj', iid: '5' },
      global: { stubs: { RouterLink: RouterLinkStub, PipelineStatusBadge: true } },
    })
    await flushPromises()
    expect(w.text()).toContain('Add API')
    expect(w.text()).toContain('Adds the API')
    expect(w.text()).toContain('nice')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `bunx vitest run src/views/MergeRequestDetail.test.ts`
Expected: FAIL — placeholder renders empty.

- [ ] **Step 3: Implement the view**

Replace `src/views/MergeRequestDetail.vue` with:

```vue
<script setup lang="ts">
import { computed, toRef } from 'vue'
import { ArrowLeft, ExternalLink } from '@lucide/vue'
import { useMergeRequest } from '@/features/merge_requests/composables/useMergeRequest'
import MrStateBadge from '@/features/merge_requests/components/MrStateBadge.vue'
import MergeRequestDetailRail from '@/features/merge_requests/components/MergeRequestDetailRail.vue'
import MrDiscussion from '@/features/merge_requests/components/MrDiscussion.vue'
import ErrorNotice from '@/shared/components/ErrorNotice.vue'

const props = defineProps<{ fullPath: string; iid: string }>()
const fullPath = toRef(props, 'fullPath')
const iid = toRef(props, 'iid')

const { data: mr, isLoading, error } = useMergeRequest(fullPath, iid)

const threads = computed(
  () =>
    mr.value?.discussions.nodes
      ?.filter((d): d is NonNullable<typeof d> => !!d)
      .map((d) => ({
        id: d.id,
        notes: (d.notes.nodes ?? []).filter((n): n is NonNullable<typeof n> => !!n && !n.system),
      }))
      .filter((t) => t.notes.length) ?? [],
)
</script>

<template>
  <div class="mx-auto w-full max-w-5xl px-6 py-8">
    <ErrorNotice v-if="error" :error="error" />
    <div v-else-if="isLoading" class="text-sm text-muted-foreground">Loading…</div>

    <template v-else-if="mr">
      <RouterLink
        :to="{ name: 'merge-requests', params: { fullPath } }"
        class="group/back -ml-1 flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft class="size-4 transition-transform group-hover/back:-translate-x-0.5" />
        Merge requests
      </RouterLink>

      <div class="mt-3 flex items-start justify-between gap-4">
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <h1 class="text-title font-semibold text-foreground">{{ mr.title }}</h1>
            <MrStateBadge :state="mr.state" :draft="mr.draft" />
          </div>
          <p class="mt-1 font-mono text-xs text-muted-foreground">!{{ mr.iid }}</p>
        </div>
        <a
          :href="mr.webUrl"
          target="_blank"
          rel="noopener"
          class="inline-flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <ExternalLink class="size-3.5" /> Open in GitLab
        </a>
      </div>

      <div class="mt-6 grid gap-8 md:grid-cols-[1fr_16rem]">
        <div class="min-w-0 space-y-8">
          <div v-if="mr.descriptionHtml" class="prose prose-sm prose-invert max-w-none" v-html="mr.descriptionHtml" />
          <MrDiscussion :threads="threads" :full-path="fullPath" :iid="iid" :mr-id="mr.id" />
        </div>
        <MergeRequestDetailRail :mr="mr" />
      </div>
    </template>
  </div>
</template>
```

> `v-html="mr.descriptionHtml"` renders GitLab-provided HTML. GitLab already sanitizes `descriptionHtml`, but to match the issue views' defense-in-depth, check how `IssueDetail.vue` renders description (it uses `MarkdownText`/`dompurify`). If the issue view sanitizes server HTML before injecting, do the same here: run `mr.descriptionHtml` through the same `dompurify` path rather than raw `v-html`. Use the existing helper the issue view uses; do not introduce a new sanitization approach.

- [ ] **Step 4: Run to verify it passes**

Run: `bunx vitest run src/views/MergeRequestDetail.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck, format, commit**

```bash
bun run typecheck
bun run format
git add src/views/MergeRequestDetail.vue src/views/MergeRequestDetail.test.ts
git commit -m "feat(mr): merge request detail view"
```

---

## Task 14: IssueListHeader "Merge Requests" button

**Files:**
- Modify: `src/features/issues/components/IssueListHeader.vue`
- Test: `src/features/issues/components/IssueListHeader.test.ts` (create if absent)

- [ ] **Step 1: Write the failing test**

Create `src/features/issues/components/IssueListHeader.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { mount, RouterLinkStub } from '@vue/test-utils'
import IssueListHeader from './IssueListHeader.vue'

describe('IssueListHeader', () => {
  it('links to the project merge requests', () => {
    const w = mount(IssueListHeader, {
      props: {
        fullPath: 'grp/proj', repoName: 'proj', pathPrefix: 'grp', runningPipelines: 0,
        runningDotClass: '', count: 0, hasMore: false, isLoading: false,
      },
      global: { stubs: { RouterLink: RouterLinkStub } },
    })
    const targets = w.findAllComponents(RouterLinkStub).map((l) => l.props('to'))
    expect(targets).toContainEqual({ name: 'merge-requests', params: { fullPath: 'grp/proj' } })
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `bunx vitest run src/features/issues/components/IssueListHeader.test.ts`
Expected: FAIL — no MR link yet.

- [ ] **Step 3: Implement**

Edit `src/features/issues/components/IssueListHeader.vue`. Add `GitMerge` to the lucide import:

```ts
import { Plus, ArrowLeft, Workflow, GitMerge } from '@lucide/vue'
```

Add a "Merge Requests" button immediately before the existing `view-pipelines` button (inside the `<div class="flex shrink-0 items-center gap-3">`):

```vue
      <Button variant="outline" data-testid="view-merge-requests" as-child>
        <RouterLink
          :to="{ name: 'merge-requests', params: { fullPath } }"
          @click="onTabNav($event, { name: 'merge-requests', params: { fullPath } })"
        >
          <GitMerge />
          Merge Requests
        </RouterLink>
      </Button>
```

- [ ] **Step 4: Run to verify it passes**

Run: `bunx vitest run src/features/issues/components/IssueListHeader.test.ts`
Expected: PASS.

- [ ] **Step 5: Format and commit**

```bash
bun run format
git add src/features/issues/components/IssueListHeader.vue src/features/issues/components/IssueListHeader.test.ts
git commit -m "feat(mr): add merge requests entry to the issue list header"
```

---

## Task 15: Command palette MR integration

**Files:**
- Modify: `src/features/palette/lib/types.ts` (add `'Merge Requests'` to `CommandGroup` + `GROUP_ORDER`)
- Modify: `src/features/palette/lib/sources.ts` (add `mrJumpCommand`, `mrCommands`, "Open Merge Requests" route action)
- Create: `src/features/palette/composables/usePaletteMrSearch.ts`
- Modify: `src/features/palette/composables/usePaletteCommands.ts` (wire MR group)
- Modify: `src/shared/lib/persist.ts` (exclude `'merge-requests'` from dehydration)
- Test: `src/features/palette/lib/sources.test.ts` (extend), `src/features/palette/composables/usePaletteMrSearch.test.ts` (create)

- [ ] **Step 1: Write failing tests for the new sources**

Append to `src/features/palette/lib/sources.test.ts`:

```ts
import { mrJumpCommand, mrCommands } from './sources'

describe('mrJumpCommand', () => {
  it('jumps on the !iid convention', () => {
    expect(mrJumpCommand(ctx({ query: '!42' }))?.id).toBe('mr-jump-42')
  })
  it('ignores #number and plain text and missing project', () => {
    expect(mrJumpCommand(ctx({ query: '#42' }))).toBeNull()
    expect(mrJumpCommand(ctx({ query: '42' }))).toBeNull()
    expect(mrJumpCommand(ctx({ query: '!42', currentProject: null }))).toBeNull()
  })
  it('pushes the merge-request route', () => {
    const c = ctx({ query: '!7' })
    mrJumpCommand(c)!.action()
    expect(c.router.push).toHaveBeenCalledWith({
      name: 'merge-request',
      params: { fullPath: 'grp/proj', iid: '7' },
    })
  })
})

describe('mrCommands', () => {
  it('maps MR hits to Merge Requests commands', () => {
    const [cmd] = mrCommands([{ iid: '9', title: 'Refactor', state: 'opened', draft: false }], ctx())
    expect(cmd.group).toBe('Merge Requests')
    expect(cmd.title).toBe('Refactor')
    expect(cmd.subtitle).toBe('!9 · opened')
  })
})
```

Also add a route-action assertion in the existing `routeCommands` describe:

```ts
it('includes the Open Merge Requests action when a project is open', () => {
  expect(routeCommands(ctx()).map((c) => c.id)).toContain('project-merge-requests')
})
```

Create `src/features/palette/composables/usePaletteMrSearch.test.ts` (mirror `usePaletteIssueSearch.test.ts`):

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import { withQuery } from '@/test/withQuery'

const request = vi.fn()
vi.mock('@/gitlab/client', () => ({ gqlClient: { request: (...a: unknown[]) => request(...a) } }))

import { usePaletteMrSearch } from './usePaletteMrSearch'

beforeEach(() => request.mockReset())

describe('usePaletteMrSearch', () => {
  it('returns mapped MR hits for a text query', async () => {
    request.mockResolvedValue({
      project: { mergeRequests: { nodes: [{ iid: '9', title: 'Refactor', state: 'opened', draft: false }] } },
    })
    const { result } = withQuery(() => usePaletteMrSearch(ref('refactor'), ref('grp/proj')))
    await new Promise((r) => setTimeout(r, 350))
    await flushPromises()
    expect(result().hits.value).toEqual([{ iid: '9', title: 'Refactor', state: 'opened', draft: false }])
  })

  it('does not fire when query is a pure number or bang-number', async () => {
    const { result } = withQuery(() => usePaletteMrSearch(ref('!9'), ref('grp/proj')))
    await flushPromises()
    expect(request).not.toHaveBeenCalled()
    expect(result().hits.value).toEqual([])
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `bunx vitest run src/features/palette`
Expected: FAIL — new exports missing.

- [ ] **Step 3: Implement the type + group order**

Edit `src/features/palette/lib/types.ts`:

```ts
export type CommandGroup = 'Actions' | 'Projects' | 'Issues' | 'Merge Requests' | 'Views'

export const GROUP_ORDER: readonly CommandGroup[] = [
  'Actions', 'Projects', 'Issues', 'Merge Requests', 'Views',
]
```

Add an MR hit type to `types.ts`:

```ts
export type PaletteMrHit = { iid: string; title: string; state: string; draft: boolean }
```

- [ ] **Step 4: Implement the sources**

Edit `src/features/palette/lib/sources.ts`. Add `GitMerge` to the lucide import. In `routeCommands`, inside the `if (currentProject)` block, add (after `project-pipelines`):

```ts
      {
        id: 'project-merge-requests',
        group: 'Actions',
        title: 'Open Merge Requests',
        subtitle: currentProject,
        icon: GitMerge,
        action: () => router.push({ name: 'merge-requests', params: { fullPath: currentProject } }),
      },
```

Append these exports to `sources.ts`:

```ts
import type { PaletteMrHit } from './types' // add to existing type import line

/** Direct `!42` jump to a merge request in the current project. */
export function mrJumpCommand(ctx: PaletteContext): Command | null {
  const { currentProject, query, router } = ctx
  if (!currentProject) return null
  const iid = query.trim().match(/^!(\d+)$/)?.[1]
  if (!iid) return null
  return {
    id: `mr-jump-${iid}`,
    group: 'Merge Requests',
    title: `Open Merge Request !${iid}`,
    subtitle: currentProject,
    icon: GitMerge,
    action: () => router.push({ name: 'merge-request', params: { fullPath: currentProject, iid } }),
  }
}

/** MR title-search hits → Merge Requests commands. */
export function mrCommands(hits: PaletteMrHit[], ctx: PaletteContext): Command[] {
  const { currentProject, router } = ctx
  if (!currentProject) return []
  return hits.map((h) => ({
    id: `mr-${h.iid}`,
    group: 'Merge Requests',
    title: h.title,
    subtitle: `!${h.iid} · ${h.state}`,
    icon: GitMerge,
    action: () => router.push({ name: 'merge-request', params: { fullPath: currentProject, iid: h.iid } }),
  }))
}
```

- [ ] **Step 5: Implement `usePaletteMrSearch`**

Create `src/features/palette/composables/usePaletteMrSearch.ts` (mirror `usePaletteIssueSearch.ts`):

```ts
import { useQuery } from '@tanstack/vue-query'
import { computed, type Ref } from 'vue'
import { refDebounced } from '@vueuse/core'
import { gqlClient } from '@/gitlab/client'
import { normalizeError, type GitLabError } from '@/gitlab/errors'
import type { PaletteMrHit } from '../lib/types'

const PaletteMrSearchDocument = `
  query PaletteMrSearch($fullPath: ID!, $search: String!) {
    project(fullPath: $fullPath) {
      mergeRequests(search: $search, sort: UPDATED_DESC, first: 8) {
        nodes { iid title state draft }
      }
    }
  }
`

type Result = {
  project?: { mergeRequests?: { nodes?: (PaletteMrHit | null)[] | null } | null } | null
}

const MIN_CHARS = 2
// Bare numbers and the `!iid` jump form are handled by mrJumpCommand, not search.
const isJumpForm = (q: string) => /^[!#]?\d+$/.test(q)

export function paletteMrSearchEnabled(query: string, project: string | null): boolean {
  const q = query.trim()
  return !!project && q.length >= MIN_CHARS && !isJumpForm(q)
}

async function fetchHits(fullPath: string, search: string): Promise<PaletteMrHit[]> {
  try {
    const data = await gqlClient.request<Result, { fullPath: string; search: string }>(
      PaletteMrSearchDocument,
      { fullPath, search },
    )
    return (data.project?.mergeRequests?.nodes ?? []).filter((n): n is PaletteMrHit => !!n)
  } catch (e) {
    throw normalizeError(e)
  }
}

export function usePaletteMrSearch(query: Ref<string>, currentProject: Ref<string | null>) {
  const debounced = refDebounced(query, 200)
  const search = computed(() => debounced.value.trim())
  const enabled = computed(() => paletteMrSearchEnabled(search.value, currentProject.value))

  const result = useQuery<PaletteMrHit[], GitLabError>({
    queryKey: computed(() => ['palette-mr-search', currentProject.value, search.value]),
    queryFn: () => {
      const project = currentProject.value
      if (!project) return Promise.resolve<PaletteMrHit[]>([])
      return fetchHits(project, search.value)
    },
    enabled,
    staleTime: 10_000,
    gcTime: 0,
  })

  const hits = computed(() => result.data.value ?? [])
  const isFetching = computed(() => result.isFetching.value && enabled.value)
  return { hits, isFetching }
}
```

- [ ] **Step 6: Wire the MR group into `usePaletteCommands`**

Edit `src/features/palette/composables/usePaletteCommands.ts`:
- Import `mrCommands`, `mrJumpCommand` from `../lib/sources` and `usePaletteMrSearch` from `./usePaletteMrSearch`.
- Call it: `const { hits: mrHits } = usePaletteMrSearch(query, currentProject)`.
- Add to `byGroup`:

```ts
      'Merge Requests': [mrJumpCommand(c), ...mrCommands(mrHits.value, c)].filter(
        (x): x is Command => x !== null,
      ),
```

(`GROUP_ORDER` already lists `'Merge Requests'`, so it renders in place; empty groups are dropped by the existing filter.)

- [ ] **Step 7: Exclude MR search from persistence**

Edit `src/shared/lib/persist.ts`, broaden the dehydrate filter:

```ts
    dehydrateOptions: {
      shouldDehydrateQuery: (query) =>
        query.state.status === 'success' &&
        query.queryKey[0] !== 'palette-issue-search' &&
        query.queryKey[0] !== 'palette-mr-search',
    },
```

- [ ] **Step 8: Run to verify all pass**

Run: `bunx vitest run src/features/palette`
Expected: PASS (sources + both palette search composables + merge tests).

- [ ] **Step 9: Typecheck, format, commit**

```bash
bun run typecheck
bun run format
git add src/features/palette src/shared/lib/persist.ts
git commit -m "feat(palette): merge request jump, search, and open action"
```

---

## Task 16: Full verification

**Files:** none (verification + cleanup commit if formatting changes anything).

- [ ] **Step 1: Format**

Run: `bun run format`

- [ ] **Step 2: Typecheck**

Run: `bun run typecheck`
Expected: PASS, no errors (queries are hand-typed; no `bun codegen` needed).

- [ ] **Step 3: Full suite**

Run: `bunx vitest run`
Expected: PASS — all prior tests plus the new MR + palette tests.

- [ ] **Step 4: Commit any formatting changes**

```bash
git add -A
git commit -m "chore(mr): format" || echo "nothing to format-commit"
```

---

## Self-Review Notes

- **Spec coverage:** A (routing/nav) → Tasks 7, 14, 15; B (module + saved-views lift) → Tasks 1–6, 10–13; C (data layer) → Tasks 4, 5; D (filters + saved views) → Tasks 3, 11 (+`useMrSavedViews`); E (detail + discussion) → Tasks 12, 13, 6; F (palette) → Task 15; G (testing) → tests in every task + Task 16.
- **Type consistency:** `MrFilters`/`MrQueryVars`/`MrState`/`MrSortKey`/`MrDraft`/`MR_FILTER_KEYS`/`mrListKey`/`mrKey`/`MR_POLL_MS` defined once in `lib/mrView.ts`; `MergeRequestListItem` (list) and `MergeRequestDetail` (detail) are the two row/detail shapes; `PaletteMrHit` defined in palette `types.ts`; `useMrAddNote` signature matches its call in `MrDiscussion.vue`; `useSavedViews(fullPath, namespace, keys)` signature is consistent across the issue and MR call sites and tests.
- **Manual GraphQL pattern** (no codegen) used for all MR queries/mutations — typecheck stays green without `bun codegen`.
- **Saved views:** issues keep working via the namespaced `useSavedViews`; MRs get a dedicated `'mr'` namespace via `useMrSavedViews`. The localStorage key change resets existing issue saved views (flagged in Task 1).
- **Decisions deferred to the implementer with explicit guidance** (confirm-the-real-API notes): `SavedViews.vue`, `ErrorNotice.vue`, `MarkdownText.vue`, `PipelineStatusBadge.vue` prop names; lucide icon names; whether `descriptionHtml` needs the issue view's `dompurify` path (it does if `IssueDetail` sanitizes — match it).
- **Out of scope (deferred slices):** diff viewer, approve/merge actions, field editing, drawer/native-window, @mentions in MR replies.
