# Issue Multi-Select — Plan 2: Combined Multi-Issue Window

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "combined" native window that opens the multi-selection as one window showing a single issue at a time behind a `‹ X of N ›` pager, each page fully editable.

**Architecture:** A new host RPC `openIssuesWindow({ fullPath, iids })` spawns a fresh `BrowserWindow` (no dedupe) at `#/projects/:fullPath/issues-window?iids=…&window=1`, built by a new `issuesWindowUrl`. A new route renders `MultiIssueWindow.vue`, which pages an index over the iids and renders `IssueDetail` for the current one with `:embedded="true"` (so `IssueDetail` emits `update:dirty` for the pager's discard-guard while `MultiIssueWindow` owns the title, pager, and chrome). `BulkActionBar`'s `open-combined` is wired to the RPC.

**Tech Stack:** Vue 3 + TS, Electrobun, vue-router (hash), Vitest.

**Depends on Plan 1** (selection + `BulkActionBar`'s `open-combined` event) and on the existing native-window feature (`issueWindowUrl`, `buildRpc`, `openIssueWindow`, `IssueDetail` `embedded`/`windowed`).

Commands: single test `bunx vitest run <path>`; typecheck `bun run typecheck`. Pre-existing unrelated typecheck errors exist (electrobun `three`, `StatusPicker.vue` unused imports) — only NEW errors in changed files matter.

---

## File Structure

- **Modify** `src/bun/issueWindow.ts` (+ `issueWindow.test.ts`) — add `issuesWindowUrl`.
- **Modify** `src/lib/rpcContract.ts`, `src/lib/rpc.ts` — add `openIssuesWindow`.
- **Modify** `src/bun/index.ts` — add `openIssuesWindow` handler (no registry).
- **Create** `src/views/MultiIssueWindow.vue` (+ test) — pager + dirty guard over `IssueDetail`.
- **Modify** `src/router/index.ts` — add the `issues-window` route.
- **Modify** `src/views/IssueList.vue` (+ test) — wire `open-combined` → `rpc.openIssuesWindow`.

---

## Task 1: `issuesWindowUrl` helper

**Files:**
- Modify: `src/bun/issueWindow.ts`
- Test: `src/bun/issueWindow.test.ts`

- [ ] **Step 1: Add failing tests**

Append to `src/bun/issueWindow.test.ts` (keep existing tests; add the import of `issuesWindowUrl` to the existing import line):

```ts
import { issueWindowUrl, issuesWindowUrl } from './issueWindow'

describe('issuesWindowUrl', () => {
  it('builds a combined-window URL with a comma-joined iids list off the bundled base', () => {
    expect(issuesWindowUrl('views://mainview/index.html', 'grp/proj', ['42', '7', '13'])).toBe(
      'views://mainview/index.html#/projects/grp/proj/issues-window?iids=42,7,13&window=1',
    )
  })

  it('builds off the HMR dev-server base and preserves iid order', () => {
    expect(issuesWindowUrl('http://localhost:5273/index.html', 'grp/proj', ['9', '1'])).toBe(
      'http://localhost:5273/index.html#/projects/grp/proj/issues-window?iids=9,1&window=1',
    )
  })

  it('handles a single iid', () => {
    expect(issuesWindowUrl('views://mainview/index.html', 'grp/sub/proj', ['5'])).toBe(
      'views://mainview/index.html#/projects/grp/sub/proj/issues-window?iids=5&window=1',
    )
  })
})
```

(If the file already imports `issueWindowUrl` on its own line, replace it with the combined import above.)

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/bun/issueWindow.test.ts`
Expected: FAIL — `issuesWindowUrl` is not exported.

- [ ] **Step 3: Implement**

Append to `src/bun/issueWindow.ts`:

```ts
// Build the hash-routed URL a combined multi-issue window loads. Same base rules
// as issueWindowUrl; the iids ride as a comma-joined query (order preserved =
// pager order) and ?window=1 marks it a native window.
export function issuesWindowUrl(base: string, fullPath: string, iids: string[]): string {
  return `${base}#/projects/${fullPath}/issues-window?iids=${iids.join(',')}&window=1`
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run src/bun/issueWindow.test.ts`
Expected: PASS (existing + 3 new).

- [ ] **Step 5: Commit**

```bash
git add src/bun/issueWindow.ts src/bun/issueWindow.test.ts
git commit -m "feat: add issuesWindowUrl for combined multi-issue windows"
```

---

## Task 2: RPC contract + bridge for `openIssuesWindow`

**Files:**
- Modify: `src/lib/rpcContract.ts`
- Modify: `src/lib/rpc.ts`

- [ ] **Step 1: Add to the contract**

In `src/lib/rpcContract.ts`, inside `LumenRequests`, after the existing `openIssueWindow` entry:

```ts
  // Open a combined native window paging through several issues (one window per
  // call, no dedupe). The window loads the issues-window route with ?window=1.
  openIssuesWindow: (a: { fullPath: string; iids: string[] }) => Promise<{ ok: boolean }>
```

- [ ] **Step 2: Add the passthrough**

In `src/lib/rpc.ts`, after the `openIssueWindow` line:

```ts
  openIssuesWindow: (a) => client().openIssuesWindow(a),
```

- [ ] **Step 3: Typecheck**

Run: `bun run typecheck`
Expected: NEW expected error only in `src/bun/index.ts` (`satisfies LumenRPC` now missing `openIssuesWindow`) — fixed in Task 3. `rpcContract.ts`/`rpc.ts` themselves error-free. Verify: `bunx vue-tsc --noEmit 2>&1 | grep -iE 'rpcContract|lib/rpc.ts'` is empty.

- [ ] **Step 4: Commit**

```bash
git add src/lib/rpcContract.ts src/lib/rpc.ts
git commit -m "feat: add openIssuesWindow to the RPC contract and bridge"
```

---

## Task 3: Host `openIssuesWindow` handler

**Files:**
- Modify: `src/bun/index.ts`

Read the current file first. It has `issueWindowUrl` imported, a `buildRpc()` factory, an `openIssueWindow` function (with the `issueWindows` registry), and the main window.

- [ ] **Step 1: Update the import**

Change the existing `import { issueWindowUrl } from './issueWindow'` to:

```ts
import { issueWindowUrl, issuesWindowUrl } from './issueWindow'
```

- [ ] **Step 2: Add the handler function**

Directly below the existing `openIssueWindow` function, add `openIssuesWindow` (no registry — a fresh window each call, per spec):

```ts
function openIssuesWindow({ fullPath, iids }: { fullPath: string; iids: string[] }): {
  ok: boolean
} {
  const repo = fullPath.split('/').at(-1) ?? fullPath
  // Cascade off the count of all open issue windows so a combined window doesn't
  // land exactly on a single-issue one. No registry: combined windows are not
  // deduped or focused — each "Open combined" is a fresh window.
  const offset = issueWindows.size * 24
  const issuesWin = new BrowserWindow({
    title: `${iids.length} issues · ${repo}`,
    url: issuesWindowUrl(url, fullPath, iids),
    frame: { width: 760, height: 920, x: 140 + offset, y: 140 + offset },
    rpc: buildRpc(),
  })
  void issuesWin
  return { ok: true }
}
```

- [ ] **Step 3: Register the handler**

In `buildRpc()`'s `requests` object, after the `openIssueWindow` handler line, add:

```ts
        openIssuesWindow: async ({ fullPath, iids }) => openIssuesWindow({ fullPath, iids }),
```

- [ ] **Step 4: Typecheck**

Run: `bunx vue-tsc --noEmit 2>&1 | grep -i 'src/bun/index.ts'`
Expected: empty (the prior missing-handler error is resolved).

- [ ] **Step 5: Commit**

```bash
git add src/bun/index.ts
git commit -m "feat: host handler to open a combined multi-issue window"
```

---

## Task 4: `MultiIssueWindow` view

**Files:**
- Create: `src/views/MultiIssueWindow.vue`
- Test: `src/views/MultiIssueWindow.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/views/MultiIssueWindow.test.ts`. Stub `IssueDetail` (it does its own data fetching) with a marker that can emit `update:dirty`, and mock `useConfirm`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const confirmMock = vi.fn()
vi.mock('@/composables/useConfirm', () => ({ useConfirm: () => ({ confirm: confirmMock }) }))

// IssueDetail fetches data; stub it to a marker that shows the iid and can emit dirty.
const IssueDetailStub = {
  name: 'IssueDetail',
  props: ['fullPath', 'iid', 'embedded'],
  emits: ['update:dirty'],
  template: `<div class="detail-stub" :data-iid="iid">
    <button data-testid="make-dirty" @click="$emit('update:dirty', true)" />
  </div>`,
}

import MultiIssueWindow from './MultiIssueWindow.vue'

const mountWindow = (iids: string[]) =>
  mount(MultiIssueWindow, {
    props: { fullPath: 'grp/proj', iids },
    global: { stubs: { IssueDetail: IssueDetailStub } },
  })

beforeEach(() => confirmMock.mockReset())

describe('MultiIssueWindow', () => {
  it('shows the pager position and the first issue', () => {
    const w = mountWindow(['42', '7', '13'])
    expect(w.get('[data-testid="pager-position"]').text()).toBe('1 of 3')
    expect(w.get('.detail-stub').attributes('data-iid')).toBe('42')
  })

  it('disables prev at the start and next at the end', async () => {
    const w = mountWindow(['1', '2'])
    expect(w.get('[data-testid="pager-prev"]').attributes('disabled')).toBeDefined()
    await w.get('[data-testid="pager-next"]').trigger('click')
    expect(w.get('[data-testid="pager-position"]').text()).toBe('2 of 2')
    expect(w.get('[data-testid="pager-next"]').attributes('disabled')).toBeDefined()
  })

  it('advances to the next issue on Next', async () => {
    const w = mountWindow(['42', '7'])
    await w.get('[data-testid="pager-next"]').trigger('click')
    expect(w.get('.detail-stub').attributes('data-iid')).toBe('7')
  })

  it('blocks paging when the page is dirty and discard is cancelled', async () => {
    const w = mountWindow(['1', '2'])
    await w.get('[data-testid="make-dirty"]').trigger('click')
    confirmMock.mockResolvedValue(false)
    await w.get('[data-testid="pager-next"]').trigger('click')
    await flushPromises()
    expect(w.get('[data-testid="pager-position"]').text()).toBe('1 of 2')
  })

  it('pages when the page is dirty and discard is confirmed', async () => {
    const w = mountWindow(['1', '2'])
    await w.get('[data-testid="make-dirty"]').trigger('click')
    confirmMock.mockResolvedValue(true)
    await w.get('[data-testid="pager-next"]').trigger('click')
    await flushPromises()
    expect(w.get('[data-testid="pager-position"]').text()).toBe('2 of 2')
  })

  it('renders 1 of 1 with both buttons disabled for a single iid', () => {
    const w = mountWindow(['9'])
    expect(w.get('[data-testid="pager-position"]').text()).toBe('1 of 1')
    expect(w.get('[data-testid="pager-prev"]').attributes('disabled')).toBeDefined()
    expect(w.get('[data-testid="pager-next"]').attributes('disabled')).toBeDefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/views/MultiIssueWindow.test.ts`
Expected: FAIL — component not found.

- [ ] **Step 3: Implement**

Create `src/views/MultiIssueWindow.vue`:

```vue
<script setup lang="ts">
import { ref, computed } from 'vue'
import { useTitle, onKeyStroke } from '@vueuse/core'
import { ChevronLeft, ChevronRight } from '@lucide/vue'
import IssueDetail from '@/views/IssueDetail.vue'
import { useConfirm } from '@/composables/useConfirm'

const props = defineProps<{ fullPath: string; iids: string[]; windowed?: boolean }>()

const index = ref(0)
const total = computed(() => props.iids.length)
const current = computed<string | null>(() => props.iids[index.value] ?? null)

// IssueDetail is rendered with :embedded — that keeps its update:dirty emit (which
// the pager guard needs) while turning off its own title, route-leave guard, and
// back-arrow, so this window owns the chrome. We track the current page's dirty
// state to guard paging away from unsaved edits.
const dirty = ref(false)
const { confirm } = useConfirm()

const repoName = computed(() => props.fullPath.split('/').at(-1) ?? props.fullPath)
useTitle(
  computed(() =>
    total.value ? `${repoName.value} · ${index.value + 1} of ${total.value}` : 'lumen',
  ),
)

async function go(delta: number) {
  const nextIndex = index.value + delta
  if (nextIndex < 0 || nextIndex >= total.value) return
  if (dirty.value) {
    const ok = await confirm({
      title: 'Discard unsaved changes?',
      description: "Your edits to this issue haven't been saved.",
    })
    if (!ok) return
  }
  dirty.value = false
  index.value = nextIndex
}
const prev = () => go(-1)
const next = () => go(1)

// Arrow keys page, but never while typing in a field (mirrors IssueList's guard).
function typingInField(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null
  return !!t && (/^(INPUT|TEXTAREA)$/.test(t.tagName) || t.isContentEditable)
}
onKeyStroke('ArrowLeft', (e) => {
  if (!typingInField(e)) prev()
})
onKeyStroke('ArrowRight', (e) => {
  if (!typingInField(e)) next()
})

const navBtn =
  'grid size-7 place-items-center rounded-md border border-border text-muted-foreground transition-colors outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted-foreground'
</script>

<template>
  <div
    v-if="total === 0"
    class="grid place-items-center py-24 text-sm text-muted-foreground"
  >
    No issues.
  </div>
  <div v-else>
    <header
      class="mb-5 flex items-center justify-center gap-3 border-b border-border pb-3"
    >
      <button
        type="button"
        data-testid="pager-prev"
        aria-label="Previous issue"
        :class="navBtn"
        :disabled="index === 0"
        @click="prev"
      >
        <ChevronLeft class="size-4" />
      </button>
      <span
        data-testid="pager-position"
        class="min-w-20 text-center font-mono text-sm font-medium tabular-nums text-foreground"
      >
        {{ index + 1 }} of {{ total }}
      </span>
      <button
        type="button"
        data-testid="pager-next"
        aria-label="Next issue"
        :class="navBtn"
        :disabled="index >= total - 1"
        @click="next"
      >
        <ChevronRight class="size-4" />
      </button>
    </header>

    <IssueDetail
      :key="current ?? ''"
      :full-path="fullPath"
      :iid="current ?? ''"
      embedded
      @update:dirty="dirty = $event"
    />
  </div>
</template>
```

Note: `embedded` is passed (not `windowed`). The `windowed` prop on this component is accepted (the route maps `?window=1`) but unused for rendering — the combined window's chrome is owned here, so `IssueDetail` needs `embedded` to stay quiet. Keep the prop in `defineProps` so the route's prop mapping typechecks.

- [ ] **Step 4: Run tests to verify they pass**

Run: `bunx vitest run src/views/MultiIssueWindow.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Typecheck**

Run: `bunx vue-tsc --noEmit 2>&1 | grep -i 'MultiIssueWindow'`
Expected: empty.

- [ ] **Step 6: Commit**

```bash
git add src/views/MultiIssueWindow.vue src/views/MultiIssueWindow.test.ts
git commit -m "feat: add MultiIssueWindow pager view"
```

---

## Task 5: Register the `issues-window` route

**Files:**
- Modify: `src/router/index.ts`
- Test: `src/router/index.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/router/index.test.ts` (a focused test that the new route resolves and maps props; it imports the route records, not the live router, to avoid the `beforeEach` config guard). First read `src/router/index.ts` — if the `routes` array is inline in `createRouter`, refactor it to an exported `routes` const so it can be tested, then build the router from it. The test:

```ts
import { describe, it, expect } from 'vitest'
import { createRouter, createMemoryHistory } from 'vue-router'
import { routes } from './index'

describe('issues-window route', () => {
  it('resolves the route and maps fullPath + comma-split iids from the query', () => {
    const router = createRouter({ history: createMemoryHistory(), routes })
    const resolved = router.resolve('/projects/grp/proj/issues-window?iids=42,7,13&window=1')
    expect(resolved.name).toBe('issues-window')
    // props function output for this route:
    const record = resolved.matched.at(-1)!
    const props = (record.props.default as (r: typeof resolved) => Record<string, unknown>)(resolved)
    expect(props).toEqual({ fullPath: 'grp/proj', iids: ['42', '7', '13'], windowed: true })
  })

  it('yields an empty iids array when the query is missing', () => {
    const router = createRouter({ history: createMemoryHistory(), routes })
    const resolved = router.resolve('/projects/grp/proj/issues-window')
    const record = resolved.matched.at(-1)!
    const props = (record.props.default as (r: typeof resolved) => Record<string, unknown>)(resolved)
    expect(props).toEqual({ fullPath: 'grp/proj', iids: [], windowed: false })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/router/index.test.ts`
Expected: FAIL — `routes` not exported / route missing.

- [ ] **Step 3: Implement**

In `src/router/index.ts`:

(a) If the routes are inline, lift them to an exported const. Change:

```ts
export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    // ...existing route objects...
  ],
})
```

to:

```ts
export const routes = [
  // ...existing route objects unchanged...
]

export const router = createRouter({
  history: createWebHashHistory(),
  routes,
})
```

(b) Add the new route object to the `routes` array (after the `issue` route):

```ts
    {
      path: '/projects/:fullPath(.*)/issues-window',
      name: 'issues-window',
      component: () => import('@/views/MultiIssueWindow.vue'),
      props: (route) => ({
        fullPath: route.params.fullPath,
        // Comma-joined in issuesWindowUrl; split back to the pager's iid list.
        iids:
          typeof route.query.iids === 'string' && route.query.iids
            ? route.query.iids.split(',')
            : [],
        windowed: route.query.window === '1',
      }),
    },
```

Note: `route.params.fullPath` from a `(.*)` matcher is a string for these paths. If TypeScript widens it to `string | string[]`, coerce with `String(route.params.fullPath)`.

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run src/router/index.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Typecheck**

Run: `bunx vue-tsc --noEmit 2>&1 | grep -i 'router/index'`
Expected: empty.

- [ ] **Step 6: Commit**

```bash
git add src/router/index.ts src/router/index.test.ts
git commit -m "feat: add issues-window route for the combined window"
```

---

## Task 6: Wire `open-combined` to the RPC in `IssueList`

**Files:**
- Modify: `src/views/IssueList.vue`
- Test: `src/views/IssueList.test.ts`

`IssueList.vue` already imports `{ rpc } from '@/lib/rpc'` (used by the single-issue expand). Plan 1 left `@open-combined="() => {}"` as a placeholder; replace it with the real call.

- [ ] **Step 1: Update the test**

In `src/views/IssueList.test.ts`, the `@/lib/rpc` mock currently exposes `openIssueWindow` (and, from Plan 1, nothing else). Extend it to also spy `openIssuesWindow`. Find the existing `vi.mock('@/lib/rpc', ...)` and add the spy:

```ts
const openIssuesWindow = vi.fn().mockResolvedValue({ ok: true })
vi.mock('@/lib/rpc', () => ({
  rpc: {
    openIssueWindow: (a: { fullPath: string; iid: string }) => openIssueWindow(a),
    openIssuesWindow: (a: { fullPath: string; iids: string[] }) => openIssuesWindow(a),
  },
}))
```

(Keep the existing `openIssueWindow` spy declaration; add `openIssuesWindow` beside it and `openIssuesWindow.mockClear()` in `beforeEach`.)

Add a test in the `IssueList — select mode` describe block:

```ts
  it('opens a combined window with the selected iids', async () => {
    mockQuery({ issues: ref([issue]) })
    const w = mountList()
    await flushPromises()
    await w.get('[data-testid="toggle-select-mode"]').trigger('click')
    await w.get('[data-testid="issue-row"]').trigger('click') // selects issue #7
    await w.get('[data-testid="bulk-open-combined"]').trigger('click')
    expect(openIssuesWindow).toHaveBeenCalledWith({ fullPath: 'grp/proj', iids: ['7'] })
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/views/IssueList.test.ts`
Expected: FAIL — `open-combined` is a no-op, so `openIssuesWindow` is never called.

- [ ] **Step 3: Implement**

In `src/views/IssueList.vue`, add a handler near the other bulk handlers from Plan 1:

```ts
function onOpenCombined() {
  const iids = selectedIids()
  if (iids.length) rpc.openIssuesWindow({ fullPath: props.fullPath, iids })
}
```

Change the `<BulkActionBar>` binding from `@open-combined="() => {}"` to:

```html
      @open-combined="onOpenCombined"
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bunx vitest run src/views/IssueList.test.ts`
Expected: PASS — including the new combined-window test and all existing tests.

- [ ] **Step 5: Typecheck**

Run: `bunx vue-tsc --noEmit 2>&1 | grep -i 'IssueList'`
Expected: empty.

- [ ] **Step 6: Commit**

```bash
git add src/views/IssueList.vue src/views/IssueList.test.ts
git commit -m "feat: open-combined opens a combined multi-issue window"
```

---

## Final Verification (Plan 2)

- [ ] **Full suite**

Run: `bunx vitest run`
Expected: PASS, no regressions.

- [ ] **Typecheck (no new errors in changed files)**

Run: `bunx vue-tsc --noEmit 2>&1 | grep -iE 'issueWindow|rpcContract|lib/rpc.ts|src/bun/index|MultiIssueWindow|router/index|IssueList'`
Expected: empty.

- [ ] **Manual smoke** (GUI)

`bun run app:dev`: select several issues → **Open combined** → a new native window opens titled `N issues · <repo>`, showing `1 of N` with a pager; Next/Prev page through (disabled at ends); `←/→` keys page; editing a page then paging prompts to discard; closing and re-opening combined spawns a separate window.
