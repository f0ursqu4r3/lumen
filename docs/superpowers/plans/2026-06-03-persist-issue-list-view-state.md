# Persist Issue-List View State Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the issues list return exactly as the user left it — search, filters, sort, group-by, view, and board column-scope — per project, across refresh and navigation.

**Architecture:** Promote sort/group/view/scope into the URL query alongside the existing filter keys, so `useIssueFilters` owns all list view-state with the URL as single source of truth. localStorage (keyed per project by `fullPath`) seeds the URL on arrival when no filter key is present, and mirrors the URL on every change. `IssueList.vue` drops its local refs and binds to the composable.

**Tech Stack:** Vue 3 `<script setup>`, vue-router, `@vueuse/core`, Vitest + `@vue/test-utils`, bun.

---

## File Structure

- `src/composables/useIssueFilters.ts` — gains `sort`/`group`/`view`/`scope` computeds, a per-project storage key, a seed watcher, and a persist watcher. Remains the single source of truth for list view-state.
- `src/composables/useIssueFilters.test.ts` — test setup updated to mount under a route that supplies `fullPath`; new cases for the four keys, seeding, and persistence.
- `src/views/IssueList.vue` — four local refs removed; the four values come from the composable (aliased to existing template names so the template is untouched).
- `src/views/IssueList.test.ts` — add a `localStorage.clear()` in `beforeEach` so seeding stays deterministic.

Reference types live in `src/lib/issueView.ts`: `SortKey = 'priority' | 'title' | 'updated' | 'created'`, `GroupKey = 'none' | 'status' | 'priority' | 'assignee'`.

Run tests with: `bunx vitest run <file>` (single file) or `bunx vitest run` (all). Typecheck with `bun run typecheck`.

---

## Task 1: Add sort/group/view/scope computeds to the composable

**Files:**
- Modify: `src/composables/useIssueFilters.ts`
- Test: `src/composables/useIssueFilters.test.ts`

- [ ] **Step 1: Update the test setup to provide a `fullPath` param**

The existing setup mounts at `path: '/'`, which yields no `route.params.fullPath`. Seeding/persistence need one. Replace the `setup` function's router + mount so it runs under a project route. Edit `src/composables/useIssueFilters.test.ts`:

Replace:

```ts
function setup(initialQuery: Record<string, string | string[]> = {}) {
  let api!: ReturnType<typeof useIssueFilters>
  const router: Router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { render: () => null } }],
  })
  const Comp = defineComponent({
    setup() {
      api = useIssueFilters()
      return () => h('div')
    },
  })
  return {
    router,
    mountIt: async () => {
      await router.replace({ path: '/', query: initialQuery })
      await router.isReady()
      mount(Comp, { global: { plugins: [router] } })
      await nextTick()
      return api
    },
  }
}
```

with:

```ts
function setup(
  initialQuery: Record<string, string | string[]> = {},
  fullPath = 'grp/proj',
) {
  let api!: ReturnType<typeof useIssueFilters>
  const router: Router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/p/:fullPath(.*)', component: { render: () => null } }],
  })
  const Comp = defineComponent({
    setup() {
      api = useIssueFilters()
      return () => h('div')
    },
  })
  return {
    router,
    mountIt: async () => {
      await router.replace({ path: `/p/${fullPath}`, query: initialQuery })
      await router.isReady()
      mount(Comp, { global: { plugins: [router] } })
      await nextTick()
      return api
    },
  }
}
```

Also add a `localStorage.clear()` to keep tests isolated. Change the existing hooks:

```ts
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())
```

to:

```ts
  beforeEach(() => {
    vi.useFakeTimers()
    localStorage.clear()
  })
  afterEach(() => vi.useRealTimers())
```

- [ ] **Step 2: Write the failing test for the four new keys**

Add these cases inside the `describe('useIssueFilters', ...)` block in `src/composables/useIssueFilters.test.ts`:

```ts
  it('hydrates sort/group/view/scope from the query', async () => {
    const { mountIt } = setup({
      sort: 'priority',
      group: 'status',
      view: 'board',
      scope: 'team',
    })
    const api = await mountIt()
    expect(api.sort.value).toBe('priority')
    expect(api.group.value).toBe('status')
    expect(api.view.value).toBe('board')
    expect(api.scope.value).toBe('team')
  })

  it('defaults sort/group/view/scope when the keys are absent', async () => {
    const { mountIt } = setup()
    const api = await mountIt()
    expect(api.sort.value).toBe('updated')
    expect(api.group.value).toBe('none')
    expect(api.view.value).toBe('list')
    expect(api.scope.value).toBe('assigned')
  })

  it('writes non-default sort/group/view/scope and omits defaults', async () => {
    const { router, mountIt } = setup()
    const api = await mountIt()
    api.sort.value = 'title'
    api.view.value = 'board'
    await flushPromises()
    expect(router.currentRoute.value.query.sort).toBe('title')
    expect(router.currentRoute.value.query.view).toBe('board')
    api.sort.value = 'updated'
    api.view.value = 'list'
    await flushPromises()
    expect(router.currentRoute.value.query.sort).toBeUndefined()
    expect(router.currentRoute.value.query.view).toBeUndefined()
  })
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `bunx vitest run src/composables/useIssueFilters.test.ts`
Expected: FAIL — `api.sort` / `api.group` / `api.view` / `api.scope` are undefined.

- [ ] **Step 4: Implement the four computeds**

Edit `src/composables/useIssueFilters.ts`. Add the type import at the top, after the existing `IssueFilters` import:

```ts
import type { SortKey, GroupKey } from '@/lib/issueView'
```

Add a `View` type alias next to the existing `State` type:

```ts
type State = NonNullable<IssueFilters['state']>
type View = 'list' | 'board'
```

Then, immediately after the existing `author` computed (the block ending `set: (v) => patch({ author: v || undefined }),` `})`), add:

```ts
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
```

Add the four to the return object (after `author,`):

```ts
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
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `bunx vitest run src/composables/useIssueFilters.test.ts`
Expected: PASS (all cases, including the pre-existing ones).

- [ ] **Step 6: Commit**

```bash
git add src/composables/useIssueFilters.ts src/composables/useIssueFilters.test.ts
git commit -m "feat: add sort/group/view/scope to issue filter URL state

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Persist the filter slice to localStorage

**Files:**
- Modify: `src/composables/useIssueFilters.ts`
- Test: `src/composables/useIssueFilters.test.ts`

- [ ] **Step 1: Write the failing persistence test**

Add to `src/composables/useIssueFilters.test.ts`:

```ts
  it('persists the filter slice to localStorage per project', async () => {
    const { mountIt } = setup({}, 'grp/proj')
    const api = await mountIt()
    api.sort.value = 'title'
    api.assignee.value = 'ada'
    await flushPromises()
    const saved = JSON.parse(localStorage.getItem('lumen:issue-filters:grp/proj')!)
    expect(saved).toMatchObject({ sort: 'title', assignee: 'ada' })
  })

  it('clears the storage entry when all keys return to default', async () => {
    const { mountIt } = setup({ sort: 'title' }, 'grp/proj')
    const api = await mountIt()
    expect(localStorage.getItem('lumen:issue-filters:grp/proj')).not.toBeNull()
    api.sort.value = 'updated'
    await flushPromises()
    expect(localStorage.getItem('lumen:issue-filters:grp/proj')).toBeNull()
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bunx vitest run src/composables/useIssueFilters.test.ts -t persists`
Expected: FAIL — nothing is written to localStorage.

- [ ] **Step 3: Implement the storage helpers and persist watcher**

Edit `src/composables/useIssueFilters.ts`. Add module-level constants and helpers, placed after the `asString` helper (before the JSDoc block for `useIssueFilters`):

```ts
// URL keys that make up the persisted, per-project view-state slice.
const FILTER_KEYS = [
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

const storageKey = (fullPath: string) => `lumen:issue-filters:${fullPath}`

function writeSaved(fullPath: string, slice: Record<string, string | string[]>) {
  try {
    if (Object.keys(slice).length)
      localStorage.setItem(storageKey(fullPath), JSON.stringify(slice))
    else localStorage.removeItem(storageKey(fullPath))
  } catch {
    // storage unavailable (quota / disabled) — degrade silently
  }
}
```

Inside `useIssueFilters`, after the `filters` computed and before the `return`, add a `fullPath` source and the persist watcher:

```ts
  const fullPath = computed(() => asString(route.params.fullPath))

  // Mirror the URL's filter slice into per-project storage on every change.
  watch(
    () => FILTER_KEYS.map((k) => route.query[k]),
    () => {
      const path = fullPath.value
      if (!path) return
      const slice: Record<string, string | string[]> = {}
      for (const k of FILTER_KEYS) {
        const v = route.query[k]
        if (v != null) slice[k] = v as string | string[]
      }
      writeSaved(path, slice)
    },
    { deep: true },
  )
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bunx vitest run src/composables/useIssueFilters.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/composables/useIssueFilters.ts src/composables/useIssueFilters.test.ts
git commit -m "feat: persist issue-list view state to localStorage

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Seed the URL from localStorage on arrival

**Files:**
- Modify: `src/composables/useIssueFilters.ts`
- Test: `src/composables/useIssueFilters.test.ts`

- [ ] **Step 1: Write the failing seed tests**

Add to `src/composables/useIssueFilters.test.ts`:

```ts
  it('seeds saved state into the query when no filter key is present', async () => {
    localStorage.setItem(
      'lumen:issue-filters:grp/proj',
      JSON.stringify({ sort: 'title', assignee: 'ada' }),
    )
    const { router, mountIt } = setup({}, 'grp/proj')
    const api = await mountIt()
    await flushPromises()
    expect(router.currentRoute.value.query.sort).toBe('title')
    expect(router.currentRoute.value.query.assignee).toBe('ada')
    expect(api.sort.value).toBe('title')
  })

  it('does NOT seed when the query already carries a filter key', async () => {
    localStorage.setItem(
      'lumen:issue-filters:grp/proj',
      JSON.stringify({ sort: 'title' }),
    )
    const { router, mountIt } = setup({ state: 'closed' }, 'grp/proj')
    await mountIt()
    await flushPromises()
    expect(router.currentRoute.value.query.sort).toBeUndefined()
  })

  it('seeds while preserving unrelated query keys like issue', async () => {
    localStorage.setItem(
      'lumen:issue-filters:grp/proj',
      JSON.stringify({ sort: 'title' }),
    )
    const { router, mountIt } = setup({ issue: '9' }, 'grp/proj')
    await mountIt()
    await flushPromises()
    expect(router.currentRoute.value.query.sort).toBe('title')
    expect(router.currentRoute.value.query.issue).toBe('9')
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bunx vitest run src/composables/useIssueFilters.test.ts -t seed`
Expected: FAIL — no seeding occurs; `query.sort` stays undefined.

- [ ] **Step 3: Implement the read helper and seed watcher**

Edit `src/composables/useIssueFilters.ts`. Add a read helper next to `writeSaved`:

```ts
function readSaved(fullPath: string): Record<string, string | string[]> {
  try {
    const raw = localStorage.getItem(storageKey(fullPath))
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}
```

Inside `useIssueFilters`, immediately after the `fullPath` computed (and before the persist watcher), add the seed watcher:

```ts
  // On arrival / project switch, restore saved state — but only when the URL
  // specifies none of the filter keys, so explicit and shared links win.
  watch(
    fullPath,
    (path) => {
      if (!path) return
      if (FILTER_KEYS.some((k) => route.query[k] != null)) return
      const saved = readSaved(path)
      if (Object.keys(saved).length)
        router.replace({ query: { ...route.query, ...saved } })
    },
    { immediate: true },
  )
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bunx vitest run src/composables/useIssueFilters.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/composables/useIssueFilters.ts src/composables/useIssueFilters.test.ts
git commit -m "feat: seed issue-list view state from localStorage on arrival

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Wire IssueList.vue to the composable

**Files:**
- Modify: `src/views/IssueList.vue`
- Modify: `src/views/IssueList.test.ts`

- [ ] **Step 1: Make IssueList tests deterministic against seeding**

Edit `src/views/IssueList.test.ts`. The mounting tests navigate to routes with no filter key, so a stray localStorage entry could seed and change behavior. Add a clear before each test. Find the existing top-level `beforeEach` in the file (it sets up the router / mounts). If there is one, add `localStorage.clear()` as its first line. If there is no `beforeEach`, add one inside the top-level `describe`:

```ts
  beforeEach(() => {
    localStorage.clear()
  })
```

Ensure `beforeEach` is in the import from `vitest` at the top of the file (it imports from `vitest`); add it to that import list if missing.

- [ ] **Step 2: Remove the four local refs and bind to the composable**

Edit `src/views/IssueList.vue`.

Delete these four lines (around lines 101–105):

```ts
const view = ref<'list' | 'board'>('list')
const sortKey = ref<SortKey>('updated')
const groupKey = ref<GroupKey>('none')
// Which scoped-label group defines the board columns (assigned / priority / team…).
const boardScope = ref('assigned')
```

Replace the existing `useIssueFilters()` destructure (lines 88–98) so the four new values come from the composable, aliased to the names the template already uses (`view`, `sortKey`, `groupKey`, `boardScope`):

```ts
const {
  state,
  search,
  labels: labelTitles,
  assignee,
  author,
  sort: sortKey,
  group: groupKey,
  view,
  scope: boardScope,
  activeCount,
  toggleLabel,
  clearAll,
  filters,
} = useIssueFilters()
```

The template (`v-model="sortKey"`, `v-model="groupKey"`, `v-model="boardScope"`, `@click="view = 'list'"`, etc.) is unchanged — the aliased writable computeds support assignment and `v-model`.

- [ ] **Step 3: Remove now-unused type imports if they are no longer referenced**

In `src/views/IssueList.vue`, `SortKey` / `GroupKey` were used to type the deleted refs. Check whether they are still referenced elsewhere in the file:

Run: `grep -n "SortKey\|GroupKey" src/views/IssueList.vue`

If a type is no longer referenced anywhere, remove it from the `@/lib/issueView` import block to keep the lint clean. If it is still referenced, leave it.

- [ ] **Step 4: Typecheck and run the affected tests**

Run: `bun run typecheck`
Expected: no errors.

Run: `bunx vitest run src/views/IssueList.test.ts src/composables/useIssueFilters.test.ts`
Expected: PASS.

- [ ] **Step 5: Manual smoke check (optional but recommended)**

Use the `/run` skill (or `bun run dev`) to open a project's issues list. Change sort, group, view, a filter, and search; navigate to an issue and back, then refresh — the view should return as left. Open a second project — it should have its own remembered state (or defaults).

- [ ] **Step 6: Commit**

```bash
git add src/views/IssueList.vue src/views/IssueList.test.ts
git commit -m "feat: bind issue-list sort/group/view/scope to persisted filters

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Final verification

- [ ] Run the full suite: `bunx vitest run` — all pass.
- [ ] Typecheck: `bun run typecheck` — clean.
- [ ] Confirm against the spec: per-project scope ✓ (storage keyed by `fullPath`), all fields persisted ✓ (nine keys), apply-only-when-no-filter-key ✓ (seed guard), URL mechanism ✓ (computeds + seed/persist).
