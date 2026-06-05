# Open Issues in a Native Window — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the issue drawer's **Expand** action open the issue in a new native OS window (Electrobun `BrowserWindow`) instead of navigating the main window to a full-page route.

**Architecture:** A host-side (`src/bun`) RPC handler `openIssueWindow` keeps a `Map` of one window per `fullPath#iid`, focusing an existing window or spawning a new one that loads the SPA at `#/projects/:fullPath/issues/:iid?window=1`. The webview's `IssueList.expandIssue()` calls that handler over RPC and closes the drawer; `IssueDetail` reads a `windowed` prop (mapped from the `?window=1` query by the router) to suppress its back-to-list arrow.

**Tech Stack:** Vue 3 + TypeScript, Electrobun (Bun host + webview), Vitest, vue-router (hash history).

---

## File Structure

- **Create** `src/bun/issueWindow.ts` — pure `issueWindowUrl(base, fullPath, iid)` URL builder (testable, mirrors `startUrl.ts`).
- **Create** `src/bun/issueWindow.test.ts` — unit test for the URL builder.
- **Modify** `src/bun/index.ts` — refactor the inline `rpc` into `buildRpc()`, add the `issueWindows` registry and `openIssueWindow` handler, build both the main window and issue windows with `buildRpc()`.
- **Modify** `src/lib/rpcContract.ts` — add `openIssueWindow` to `LumenRequests`.
- **Modify** `src/lib/rpc.ts` — add the `openIssueWindow` passthrough.
- **Modify** `src/router/index.ts` — map `?window=1` to a `windowed` prop on the `issue` route.
- **Modify** `src/views/IssueDetail.vue` — add the `windowed` prop; suppress the back-arrow when windowed.
- **Modify** `src/views/IssueDetail.test.ts` — assert the back-arrow is hidden when `windowed`.
- **Modify** `src/views/IssueList.vue` — `expandIssue()` calls `rpc.openIssueWindow` and closes the drawer.
- **Modify** `src/views/IssueList.test.ts` — replace the route-navigation expectations with RPC + drawer-close expectations.

Commands used throughout:
- Single test file: `bunx vitest run <path>`
- Typecheck: `bun run typecheck`

---

## Task 1: `issueWindowUrl` host helper

**Files:**
- Create: `src/bun/issueWindow.ts`
- Test: `src/bun/issueWindow.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/bun/issueWindow.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { issueWindowUrl } from './issueWindow'

describe('issueWindowUrl', () => {
  it('builds a hash route off the bundled views:// base with the windowed flag', () => {
    expect(issueWindowUrl('views://mainview/index.html', 'grp/proj', '7')).toBe(
      'views://mainview/index.html#/projects/grp/proj/issues/7?window=1',
    )
  })

  it('builds a hash route off the HMR dev-server base', () => {
    expect(issueWindowUrl('http://localhost:5273/index.html', 'grp/proj', '7')).toBe(
      'http://localhost:5273/index.html#/projects/grp/proj/issues/7?window=1',
    )
  })

  it('preserves slashes in a nested fullPath (the route matches them in the hash)', () => {
    expect(issueWindowUrl('views://mainview/index.html', 'grp/sub/proj', '42')).toBe(
      'views://mainview/index.html#/projects/grp/sub/proj/issues/42?window=1',
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/bun/issueWindow.test.ts`
Expected: FAIL — cannot resolve `./issueWindow` / `issueWindowUrl is not a function`.

- [ ] **Step 3: Write minimal implementation**

Create `src/bun/issueWindow.ts`:

```ts
// Build the hash-routed URL a native issue window loads. `base` is whatever
// resolveStartUrl produced (the HMR dev server or the bundled views:// app);
// the issue route lives in the hash (the app uses createWebHashHistory), and
// ?window=1 tells IssueDetail to render as a focused single-issue window with no
// back-to-list arrow. `fullPath` may contain slashes — the :fullPath(.*) route
// matches them inside the hash, so it is interpolated verbatim.
export function issueWindowUrl(base: string, fullPath: string, iid: string): string {
  return `${base}#/projects/${fullPath}/issues/${iid}?window=1`
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run src/bun/issueWindow.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/bun/issueWindow.ts src/bun/issueWindow.test.ts
git commit -m "feat: add issueWindowUrl helper for native issue windows"
```

---

## Task 2: RPC contract + webview bridge

**Files:**
- Modify: `src/lib/rpcContract.ts`
- Modify: `src/lib/rpc.ts`

No new unit test — this is a typed pass-through verified by `bun run typecheck` and exercised by Tasks 3 and 5.

- [ ] **Step 1: Add `openIssueWindow` to the contract**

In `src/lib/rpcContract.ts`, inside the `LumenRequests` interface, add this method after `showNotification` (keep the existing entries unchanged):

```ts
  // Open a focused, single-issue native window (or focus the existing one for
  // this issue). The window loads the SPA at the issue route with ?window=1.
  openIssueWindow: (a: { fullPath: string; iid: string }) => Promise<{ ok: boolean }>
```

- [ ] **Step 2: Add the webview passthrough**

In `src/lib/rpc.ts`, add to the exported `rpc` object (after the `showNotification` line):

```ts
  openIssueWindow: (a) => client().openIssueWindow(a),
```

- [ ] **Step 3: Typecheck**

Run: `bun run typecheck`
Expected: FAIL — `src/bun/index.ts` does not yet implement `openIssueWindow`, so the host's `satisfies LumenRPC` now reports a missing handler. This is expected and is fixed in Task 3. (No other new errors should appear; if `rpc.ts` or `rpcContract.ts` themselves report errors, fix those.)

- [ ] **Step 4: Commit**

```bash
git add src/lib/rpcContract.ts src/lib/rpc.ts
git commit -m "feat: add openIssueWindow to the RPC contract and webview bridge"
```

---

## Task 3: Host wiring — `buildRpc()` + `openIssueWindow` handler

**Files:**
- Modify: `src/bun/index.ts`

This file drives native FFI (`BrowserWindow`) and is not unit-tested; the pure URL logic it depends on is covered by Task 1. Verification is `bun run typecheck` plus the manual smoke test at the end.

- [ ] **Step 1: Add the import**

In `src/bun/index.ts`, add this import alongside the existing `./startUrl` import:

```ts
import { issueWindowUrl } from './issueWindow'
```

- [ ] **Step 2: Replace the inline `rpc` const with a factory, registry, and handler**

Replace the current block (the `const rpc = BrowserView.defineRPC<any>({ ... } satisfies LumenRPC)` definition through the `const win = new BrowserWindow({ ... rpc })` creation — lines ~13–53) with the following. The `resolveStartUrl` call moves up so `openIssueWindow` can reference the resolved base `url`:

```ts
// Resolve the base app URL once; every native window (main + per-issue) loads
// off it. app:hmr sets LUMEN_HMR=1; only then do we poll for the Vite dev server.
const url = await resolveStartUrl({ hmr: process.env.LUMEN_HMR === '1' })

// One native window per issue, keyed by `${fullPath}#${iid}`, so re-expanding an
// already-open issue focuses it instead of spawning a duplicate.
const issueWindows = new Map<string, BrowserWindow>()

function openIssueWindow({ fullPath, iid }: { fullPath: string; iid: string }): {
  ok: boolean
} {
  const key = `${fullPath}#${iid}`
  const existing = issueWindows.get(key)
  if (existing) {
    existing.activate()
    return { ok: true }
  }
  const repo = fullPath.split('/').at(-1) ?? fullPath
  // Cascade each new window so stacked issue windows don't perfectly overlap.
  const offset = issueWindows.size * 24
  const win = new BrowserWindow({
    title: `#${iid} · ${repo}`,
    url: issueWindowUrl(url, fullPath, iid),
    frame: { width: 720, height: 900, x: 120 + offset, y: 120 + offset },
    rpc: buildRpc(),
  })
  issueWindows.set(key, win)
  // Per-window close event (scoped by window id) keeps the registry accurate.
  win.on('close', () => issueWindows.delete(key))
  return { ok: true }
}

// Each native window needs its own RPC bridge; build a fresh config per window.
// The handler bodies are identical to the original single-window definition,
// plus openIssueWindow.
function buildRpc() {
  return BrowserView.defineRPC<any>({
    maxRequestTime: 30000,
    handlers: {
      requests: {
        gitlabGraphql,
        gitlabRest,
        gitlabAsset,
        getConfig: async () => {
          const { gitlabUrl } = loadConfig()
          return { url: gitlabUrl, configured: Boolean(gitlabUrl) }
        },
        saveConfig: async ({ url, token }) => {
          saveConfig({ url, token })
          return { ok: true }
        },
        clearConfig: async () => {
          clearConfig()
          return { ok: true }
        },
        openExternal: async ({ url }) => ({ ok: Utils.openExternal(url) }),
        clipboardWriteText: async ({ text }) => {
          Utils.clipboardWriteText(text)
          return { ok: true }
        },
        showNotification: async ({ title, body, subtitle, silent }) => {
          Utils.showNotification({ title, body, subtitle, silent })
          return { ok: true }
        },
        openIssueWindow: async ({ fullPath, iid }) => openIssueWindow({ fullPath, iid }),
      },
      messages: {},
    },
  } satisfies LumenRPC)
}

const win = new BrowserWindow({
  title: 'Lumen',
  url,
  frame: { width: 1280, height: 860, x: 80, y: 80 },
  rpc: buildRpc(),
})
```

Notes for the implementer:
- Delete the old standalone `const url = await resolveStartUrl(...)` line further down (it now lives at the top of this block). There must be exactly one `url` declaration.
- `openIssueWindow` and `buildRpc` are function **declarations**, so the forward reference between them (and to the later-unchanged `win`/menu code) hoists correctly regardless of order.
- Leave everything below `const win = ...` (the `ApplicationMenu` setup and the trailing `void win` / `void Electrobun`) unchanged.

- [ ] **Step 3: Typecheck**

Run: `bun run typecheck`
Expected: PASS — no errors. The `satisfies LumenRPC` now matches the contract from Task 2 (including `openIssueWindow`).

- [ ] **Step 4: Manual smoke test**

Run: `bun run app:dev`
Then, in the app: open a project → click an issue row (drawer opens) → click **Expand**.
Expected:
- A new native window opens showing the issue, titled `#<iid> · <repo>`, with **no** back-arrow.
- The main window's drawer closes; the list is visible underneath.
- Clicking **Expand** on the same issue again focuses the existing window (no duplicate).
- Expanding a different issue opens a second, slightly offset window.
- Closing an issue window and re-expanding that issue opens a fresh window (registry cleaned up).

- [ ] **Step 5: Commit**

```bash
git add src/bun/index.ts
git commit -m "feat: open issues in a per-issue native window via openIssueWindow"
```

---

## Task 4: `IssueDetail` windowed mode (suppress back-arrow)

**Files:**
- Modify: `src/router/index.ts`
- Modify: `src/views/IssueDetail.vue`
- Test: `src/views/IssueDetail.test.ts`

The `windowed` flag is delivered as a **prop** (mapped from the query by the router) rather than read via `useRoute()`, because `IssueDetail.test.ts` fully mocks `vue-router` and a prop keeps the component testable by passing `windowed` directly.

- [ ] **Step 1: Write the failing test**

In `src/views/IssueDetail.test.ts`, add this test next to the existing `omits the back link when embedded in the drawer` test (it follows the same `mountDetail` + `flushPromises` shape already used in that file):

```ts
  it('omits the back link in windowed mode', async () => {
    const w = mountDetail({ windowed: true })
    await flushPromises()
    expect(w.find('[data-testid="back-to-issues"]').exists()).toBe(false)
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/views/IssueDetail.test.ts`
Expected: FAIL on the new test — the back link still renders because `IssueDetail` does not yet accept `windowed`. (The other tests in the file still pass.)

- [ ] **Step 3: Add the `windowed` prop and gate the back-arrow**

In `src/views/IssueDetail.vue`, extend the `defineProps` call (currently `fullPath`, `iid`, `embedded?`) to add `windowed?`:

```ts
const props = defineProps<{
  fullPath: string
  iid: string
  embedded?: boolean
  windowed?: boolean
}>()
```

Then change the back-arrow `RouterLink`'s condition from:

```html
      <RouterLink
        v-if="!embedded"
```

to:

```html
      <RouterLink
        v-if="!embedded && !windowed"
```

Leave the `useTitle` call and the `onBeforeRouteLeave` dirty guard as they are — both are correct for a standalone window.

- [ ] **Step 4: Map the query to the prop in the router**

In `src/router/index.ts`, change the `issue` route from `props: true` to a props function that also derives `windowed` from the `?window=1` query:

```ts
    {
      path: '/projects/:fullPath(.*)/issues/:iid',
      name: 'issue',
      component: () => import('@/views/IssueDetail.vue'),
      props: (route) => ({
        fullPath: route.params.fullPath,
        iid: route.params.iid,
        windowed: route.query.window === '1',
      }),
    },
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `bunx vitest run src/views/IssueDetail.test.ts`
Expected: PASS — including the existing `shows the back link` test (default `windowed` is falsy) and the new `omits the back link in windowed mode` test.

- [ ] **Step 6: Typecheck**

Run: `bun run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/router/index.ts src/views/IssueDetail.vue src/views/IssueDetail.test.ts
git commit -m "feat: suppress IssueDetail back-arrow in windowed mode"
```

---

## Task 5: `IssueList.expandIssue` → open a window + close the drawer

**Files:**
- Modify: `src/views/IssueList.vue`
- Test: `src/views/IssueList.test.ts`

- [ ] **Step 1: Update the tests (red)**

In `src/views/IssueList.test.ts`:

(a) Add the RPC mock near the other `vi.mock` calls at the top of the file (after the imports, before `import IssueList from './IssueList.vue'`):

```ts
const openIssueWindow = vi.fn().mockResolvedValue({ ok: true })
vi.mock('@/lib/rpc', () => ({
  rpc: { openIssueWindow: (a: { fullPath: string; iid: string }) => openIssueWindow(a) },
}))
```

(b) Reset it in the existing `beforeEach` block — add this line alongside the other resets:

```ts
  openIssueWindow.mockClear()
```

(c) Replace the existing test `expands to the full issue route when the drawer emits expand` with:

```ts
  it('opens a native issue window and closes the drawer when expand is emitted', async () => {
    mockQuery({ issues: ref([issue]) })
    await router.replace('/?issue=7')
    await router.isReady()
    const w = mountList()
    await flushPromises()
    w.findComponent(IssueDrawer).vm.$emit('expand')
    await flushPromises()
    expect(openIssueWindow).toHaveBeenCalledWith({ fullPath: 'grp/proj', iid: '7' })
    expect(router.currentRoute.value.query.issue).toBeUndefined()
    expect(router.currentRoute.value.name).toBe('issues')
  })
```

(d) In the `IssueList — drawer dirty-guard` describe block, replace the two expand tests with versions that assert the RPC + drawer state instead of the route name:

```ts
  it('guards expand when dirty — does not open a window when discard is cancelled', async () => {
    const w = await mountDirtyGuard('/?issue=9')
    await w.get('[data-testid="stub-dirty"]').trigger('click')
    confirmMock.mockResolvedValue(false)
    await w.get('[data-testid="stub-expand"]').trigger('click')
    await flushPromises()
    expect(openIssueWindow).not.toHaveBeenCalled()
    expect(router.currentRoute.value.query.issue).toBe('9')
    expect(confirmMock).toHaveBeenCalledOnce()
  })

  it('guards expand when dirty — opens the window and closes the drawer when confirmed', async () => {
    const w = await mountDirtyGuard('/?issue=9')
    await w.get('[data-testid="stub-dirty"]').trigger('click')
    confirmMock.mockResolvedValue(true)
    await w.get('[data-testid="stub-expand"]').trigger('click')
    await flushPromises()
    expect(openIssueWindow).toHaveBeenCalledWith({ fullPath: 'grp/proj', iid: '9' })
    expect(router.currentRoute.value.query.issue).toBeUndefined()
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bunx vitest run src/views/IssueList.test.ts`
Expected: FAIL — `expandIssue` still calls `router.push({ name: 'issue' })`, so `openIssueWindow` is never called and `query.issue` is not cleared.

- [ ] **Step 3: Update `expandIssue` in `IssueList.vue`**

In `src/views/IssueList.vue`, add the rpc import next to the other `@/lib` imports (e.g. after `import { withViewTransition } from '@/lib/viewTransition'`):

```ts
import { rpc } from '@/lib/rpc'
```

Replace the existing `expandIssue` function (currently a `withViewTransition` + `router.push({ name: 'issue', ... })`) with:

```ts
async function expandIssue() {
  if (!openIid.value) return
  if (drawerDirty.value) {
    const ok = await confirm({
      title: 'Discard unsaved changes?',
      description: "Your edits to this issue haven't been saved.",
    })
    if (!ok) return
  }
  drawerDirty.value = false
  const iid = openIid.value
  // Open (or focus) the issue's own native window, then leave the list clean:
  // the drawer's unsaved edits don't carry into the fresh window, so clear
  // ?issue= the same way closing the drawer does.
  await rpc.openIssueWindow({ fullPath: props.fullPath, iid })
  const { issue: _issue, ...rest } = route.query
  router.replace({ query: rest })
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bunx vitest run src/views/IssueList.test.ts`
Expected: PASS — all `IssueList` tests, including the two rewritten dirty-guard expand tests and the rewritten expand test.

- [ ] **Step 5: Typecheck**

Run: `bun run typecheck`
Expected: PASS. (`nextTick` may now be unused in `IssueList.vue` if no other code references it — if typecheck/lint flags it, remove it from the `vue` import. Verify by searching the file for `nextTick` before removing; it is still used by `setView` and `onTabNav`, so it should remain.)

- [ ] **Step 6: Commit**

```bash
git add src/views/IssueList.vue src/views/IssueList.test.ts
git commit -m "feat: expand opens a native issue window and closes the drawer"
```

---

## Final Verification

- [ ] **Run the full test suite**

Run: `bunx vitest run`
Expected: PASS — no regressions across the suite.

- [ ] **Typecheck the whole project**

Run: `bun run typecheck`
Expected: PASS.

- [ ] **Manual end-to-end smoke test** (if not already done in Task 3, Step 4)

Run: `bun run app:dev`. Verify the full flow: row → drawer → Expand → focused native window (no back-arrow, titled `#<iid> · <repo>`), drawer closes, re-expand focuses, distinct issues cascade, closing + re-expanding works.
