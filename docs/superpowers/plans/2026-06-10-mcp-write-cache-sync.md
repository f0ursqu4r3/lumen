# MCP write → cross-view cache refresh — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After a successful MCP issue mutation, every window refetches the affected issue/list so all open views reflect the change, while any in-flight dirty draft keeps its unsaved edits.

**Architecture:** MCP issue tools run in the Bun host. On success each emits an `invalidate` signal that the host broadcasts (existing `broadcast()`) into every window as a `lumen:mcp-command` CustomEvent. A new all-windows webview installer listens and invalidates the matching TanStack Query keys. Dirty-edit safety is already guaranteed by `useIssueDraft` (re-syncs only while clean) — this plan only supplies the trigger.

**Tech Stack:** Bun + Electrobun host, Vue 3, TanStack Query (vue-query), Zod, Vitest (`bunx vitest run`).

**Spec:** `docs/superpowers/specs/2026-06-10-mcp-write-cache-sync-design.md`

---

## Pre-flight

- [ ] **Step 0: Branch off main**

```bash
git checkout main && git checkout -b feat/mcp-write-cache-sync
```

## File Structure

- Modify `src/shared/lib/rpcContract.ts` — turn `McpAppCommand` into a discriminated union (adds `invalidate`).
- Modify `src/bun/mcp/app/bridge.ts` — add `broadcast` to `HostActions`; add `emitInvalidate()`.
- Modify `src/bun/mcp/app/bridge.test.ts` — add `broadcast` to the test host; test `emitInvalidate`.
- Modify `src/bun/index.ts` — wire the `broadcast` host action to the existing `broadcast()` helper.
- Modify `src/bun/mcp/gitlab/issues.ts` — emit on the success path of the four issue tools.
- Modify `src/bun/mcp/gitlab/issues.test.ts` — assert emit on success, not on error.
- Create `src/shared/composables/useMcpCacheSync.ts` — `installMcpCacheSync(queryClient)`.
- Create `src/shared/composables/useMcpCacheSync.test.ts` — listener invalidates correct keys.
- Modify `src/main.ts` — install for all windows.

> **Dirty preservation:** already covered by `src/features/issues/composables/useIssueDraft.test.ts:156` ("re-syncs from the server only while clean"). No new draft test required.

---

## Task 1: Extend the command contract

**Files:**
- Modify: `src/shared/lib/rpcContract.ts:80-85`

- [ ] **Step 1: Replace the `McpAppCommand` interface with a discriminated union**

Replace the existing interface (lines 80-85):

```ts
// Commands the host pushes into webviews via the lumen:mcp-command CustomEvent.
// Unknown cmds are ignored by the webview.
// - navigate: MCP lumen_app_navigate, main window only.
// - invalidate: emitted after a successful MCP write so open views refetch.
export type McpAppCommand =
  | { cmd: 'navigate'; view: string; project?: string; iid?: string }
  | { cmd: 'invalidate'; resource: 'issue'; project: string; iid?: string }
```

- [ ] **Step 2: Typecheck (expect green — existing consumers already narrow on `cmd`)**

Run: `bun run typecheck`
Expected: exit 0. (`tools.ts:55` builds the `navigate` variant; `useAppStateReport.ts:71` guards `cmd !== 'navigate'` before reading navigate fields — both still valid.)

- [ ] **Step 3: Commit**

```bash
git add src/shared/lib/rpcContract.ts
git commit -m "feat(rpc): add invalidate variant to McpAppCommand"
```

---

## Task 2: `emitInvalidate` + `broadcast` host action

**Files:**
- Modify: `src/bun/mcp/app/bridge.ts`
- Test: `src/bun/mcp/app/bridge.test.ts`

- [ ] **Step 1: Write the failing tests**

In `src/bun/mcp/app/bridge.test.ts`, add `broadcast: vi.fn(() => {})` to the host object in the existing "returns the registered actions object" test (so it still satisfies `HostActions`), then add this block after the `buildCommandJs` describe:

```ts
describe('emitInvalidate', () => {
  it('broadcasts the invalidate command JS through the host', () => {
    const broadcast = vi.fn()
    setHostActions({
      openIssueWindow: vi.fn(() => ({ ok: true })),
      openIssuesWindow: vi.fn(() => ({ ok: true })),
      openSettingsWindow: vi.fn(() => ({ ok: true })),
      notify: vi.fn(),
      driveMain: vi.fn(() => ({ ok: true })),
      listWindows: vi.fn(() => []),
      broadcast,
    })
    emitInvalidate({ resource: 'issue', project: 'a/b', iid: '5' })
    expect(broadcast).toHaveBeenCalledWith(
      buildCommandJs({ cmd: 'invalidate', resource: 'issue', project: 'a/b', iid: '5' }),
    )
  })

  it('no-ops (no throw) when no host is registered', () => {
    expect(() => emitInvalidate({ resource: 'issue', project: 'a/b' })).not.toThrow()
  })
})
```

Add `emitInvalidate` to the import from `./bridge` at the top of the test file.

- [ ] **Step 2: Run tests to verify they fail**

Run: `bunx vitest run src/bun/mcp/app/bridge.test.ts`
Expected: FAIL — `emitInvalidate` is not exported (and the host-object test fails to typecheck without `broadcast`).

- [ ] **Step 3: Implement**

In `src/bun/mcp/app/bridge.ts`, add `broadcast` to the `HostActions` interface (after `driveMain`):

```ts
  /** Run JS in the main window's webview; { ok: false } if it's gone. */
  driveMain: (js: string) => { ok: boolean }
  /** Run JS in every open window (main + popouts + pager). */
  broadcast: (js: string) => void
  listWindows: () => WindowInfo[]
```

Then add, after `buildCommandJs`:

```ts
type InvalidateSignal = Omit<Extract<McpAppCommand, { cmd: 'invalidate' }>, 'cmd'>

/**
 * Broadcast a cache-invalidation signal to every window after a successful MCP
 * write. No-ops when the host bridge isn't registered (tests, headless, boot).
 */
export function emitInvalidate(signal: InvalidateSignal): void {
  host?.broadcast(buildCommandJs({ cmd: 'invalidate', ...signal }))
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bunx vitest run src/bun/mcp/app/bridge.test.ts`
Expected: PASS (all, including the updated host-object test).

- [ ] **Step 5: Commit**

```bash
git add src/bun/mcp/app/bridge.ts src/bun/mcp/app/bridge.test.ts
git commit -m "feat(mcp): emitInvalidate broadcasts cache-invalidation to all windows"
```

---

## Task 3: Wire `broadcast` in the host entrypoint

**Files:**
- Modify: `src/bun/index.ts:221-239` (the `setHostActions({...})` call)

- [ ] **Step 1: Add the `broadcast` action**

In the `setHostActions({...})` object, add after the `driveMain` block (before `listWindows`):

```ts
  broadcast: (js) => broadcast(js),
```

(The module-level `broadcast(js)` helper already exists at `src/bun/index.ts:52`.)

- [ ] **Step 2: Typecheck**

Run: `bun run typecheck`
Expected: exit 0 — `HostActions` is now fully satisfied.

- [ ] **Step 3: Commit**

```bash
git add src/bun/index.ts
git commit -m "feat(host): expose broadcast() to MCP host actions"
```

---

## Task 4: Emit on success from the issue tools

**Files:**
- Modify: `src/bun/mcp/gitlab/issues.ts`
- Test: `src/bun/mcp/gitlab/issues.test.ts`

- [ ] **Step 1: Write the failing tests**

At the top of `src/bun/mcp/gitlab/issues.test.ts`, mock the bridge (add beside the existing `./client` mock):

```ts
const emitInvalidate = vi.fn()
vi.mock('../app/bridge', () => ({ emitInvalidate }))
```

In `beforeEach`, add `emitInvalidate.mockReset()`.

Add these tests (place each in the matching `describe`):

In `describe('lumen_issue_update')`:

```ts
it('emits an issue invalidate signal on success', async () => {
  c.gql.mockResolvedValue({ updateIssue: { issue: { iid: '5', webUrl: 'u' }, errors: [] } })
  await tool('lumen_issue_update').handler({ project: 'g/p', iid: '5', title: 'X' })
  expect(emitInvalidate).toHaveBeenCalledWith({ resource: 'issue', project: 'g/p', iid: '5' })
})

it('does not emit when the update reports errors', async () => {
  c.gql.mockResolvedValue({ updateIssue: { issue: null, errors: ['nope'] } })
  await tool('lumen_issue_update').handler({ project: 'g/p', iid: '5', title: 'X' })
  expect(emitInvalidate).not.toHaveBeenCalled()
})
```

In `describe('lumen_issue_set_status')`:

```ts
it('emits an issue invalidate signal on success', async () => {
  c.gql
    .mockResolvedValueOnce({ project: { workItems: { nodes: [{ id: 'gid://gitlab/WorkItem/100' }] } } })
    .mockResolvedValueOnce({ namespace: { statuses: { nodes: [{ id: 'gid://gitlab/Status/2', name: 'Done' }] } } })
    .mockResolvedValueOnce({ workItemUpdate: { errors: [], workItem: { widgets: [{ status: { id: 'gid://gitlab/Status/2', name: 'Done', category: 'done' } }] } } })
  await tool('lumen_issue_set_status').handler({ project: 'g/p', iid: '83', status: 'Done' })
  expect(emitInvalidate).toHaveBeenCalledWith({ resource: 'issue', project: 'g/p', iid: '83' })
})

it('does not emit when the status is unknown', async () => {
  c.gql
    .mockResolvedValueOnce({ project: { workItems: { nodes: [{ id: 'gid://gitlab/WorkItem/100' }] } } })
    .mockResolvedValueOnce({ namespace: { statuses: { nodes: [{ id: 'gid://gitlab/Status/1', name: 'To do' }] } } })
  await tool('lumen_issue_set_status').handler({ project: 'g/p', iid: '83', status: 'Nope' })
  expect(emitInvalidate).not.toHaveBeenCalled()
})
```

In `describe('lumen_issue_comment')`:

```ts
it('emits an issue invalidate signal on success', async () => {
  c.gql
    .mockResolvedValueOnce({ project: { issue: { id: 'gid://gitlab/Issue/100' } } })
    .mockResolvedValueOnce({ createNote: { note: { id: 'gid://gitlab/Note/1' }, errors: [] } })
  await tool('lumen_issue_comment').handler({ project: 'g/p', iid: '5', body: 'hi' })
  expect(emitInvalidate).toHaveBeenCalledWith({ resource: 'issue', project: 'g/p', iid: '5' })
})
```

In `describe('lumen_issue_create')`:

```ts
it('emits a project-level issue invalidate signal (no iid) on success', async () => {
  c.gql.mockResolvedValue({ createIssue: { issue: { iid: '9', webUrl: 'u' }, errors: [] } })
  await tool('lumen_issue_create').handler({ project: 'g/p', title: 'New' })
  expect(emitInvalidate).toHaveBeenCalledWith({ resource: 'issue', project: 'g/p' })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bunx vitest run src/bun/mcp/gitlab/issues.test.ts`
Expected: FAIL — `emitInvalidate` never called (not yet wired).

- [ ] **Step 3: Implement**

In `src/bun/mcp/gitlab/issues.ts`, add the import:

```ts
import { emitInvalidate } from '../app/bridge'
```

Then add the emit on each success path (immediately before the success `return`):

- `lumen_issue_create` — before `return text({ created: data.createIssue.issue })`:

```ts
      emitInvalidate({ resource: 'issue', project: a.project as string })
```

- `lumen_issue_update` — before `return text({ updated: data.updateIssue.issue })`:

```ts
      emitInvalidate({ resource: 'issue', project: a.project as string, iid: a.iid as string })
```

- `lumen_issue_set_status` — before `return text({ updated: { iid: a.iid, status } })`:

```ts
      emitInvalidate({ resource: 'issue', project: a.project as string, iid: a.iid as string })
```

- `lumen_issue_comment` — before `return text(\`Comment added to ${a.project}#${a.iid}.\`)`:

```ts
      emitInvalidate({ resource: 'issue', project: a.project as string, iid: a.iid as string })
```

> Each emit sits *after* the `if (errors.length) return errorResult(...)` guard, so error paths never emit.

- [ ] **Step 4: Run tests to verify they pass**

Run: `bunx vitest run src/bun/mcp/gitlab/issues.test.ts`
Expected: PASS (all, including the pre-existing tests — they ignore the extra mocked call).

- [ ] **Step 5: Commit**

```bash
git add src/bun/mcp/gitlab/issues.ts src/bun/mcp/gitlab/issues.test.ts
git commit -m "feat(mcp): emit cache invalidation after issue writes"
```

---

## Task 5: Webview installer `installMcpCacheSync`

**Files:**
- Create: `src/shared/composables/useMcpCacheSync.ts`
- Test: `src/shared/composables/useMcpCacheSync.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/shared/composables/useMcpCacheSync.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { QueryClient } from '@tanstack/vue-query'
import { installMcpCacheSync, __resetMcpCacheSync } from './useMcpCacheSync'

function dispatch(detail: unknown) {
  window.dispatchEvent(new CustomEvent('lumen:mcp-command', { detail }))
}

let qc: QueryClient
let spy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  qc = new QueryClient()
  spy = vi.spyOn(qc, 'invalidateQueries').mockResolvedValue(undefined)
  installMcpCacheSync(qc)
})
afterEach(() => __resetMcpCacheSync())

describe('installMcpCacheSync', () => {
  it('invalidates the list and the issue/status keys when iid is present', () => {
    dispatch({ cmd: 'invalidate', resource: 'issue', project: 'a/b', iid: '5' })
    expect(spy).toHaveBeenCalledWith({ queryKey: ['issues', 'a/b'] })
    expect(spy).toHaveBeenCalledWith({ queryKey: ['issue', 'a/b', '5'] })
    expect(spy).toHaveBeenCalledWith({ queryKey: ['workItemStatus', 'a/b', '5'] })
  })

  it('invalidates only the list when iid is absent', () => {
    dispatch({ cmd: 'invalidate', resource: 'issue', project: 'a/b' })
    expect(spy).toHaveBeenCalledWith({ queryKey: ['issues', 'a/b'] })
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('ignores navigate and unknown commands', () => {
    dispatch({ cmd: 'navigate', view: 'issues', project: 'a/b' })
    dispatch({ cmd: 'invalidate', resource: 'merge_request', project: 'a/b' })
    expect(spy).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/shared/composables/useMcpCacheSync.test.ts`
Expected: FAIL — module `./useMcpCacheSync` does not exist.

- [ ] **Step 3: Implement**

Create `src/shared/composables/useMcpCacheSync.ts`:

```ts
import type { QueryClient } from '@tanstack/vue-query'
import type { McpAppCommand } from '@/shared/lib/rpcContract'

let listener: ((e: Event) => void) | null = null

/**
 * Every window (main + popouts + pager) installs this so an MCP write in the
 * host refreshes whatever issue views this window has mounted. Invalidation only
 * refetches *active* queries; inactive ones go stale and refetch on next mount.
 * Dirty issue drafts are preserved by useIssueDraft (it re-syncs only while
 * clean), so a forced refetch never clobbers unsaved edits.
 */
export function installMcpCacheSync(queryClient: QueryClient): void {
  // Install-once: a second call would duplicate the window listener.
  if (listener) return
  listener = (e: Event) => {
    const d = (e as CustomEvent).detail as McpAppCommand | undefined
    if (!d || d.cmd !== 'invalidate' || d.resource !== 'issue') return
    void queryClient.invalidateQueries({ queryKey: ['issues', d.project] })
    if (d.iid) {
      void queryClient.invalidateQueries({ queryKey: ['issue', d.project, d.iid] })
      void queryClient.invalidateQueries({ queryKey: ['workItemStatus', d.project, d.iid] })
    }
  }
  window.addEventListener('lumen:mcp-command', listener)
}

/** Test-only: uninstall and reset module state. */
export function __resetMcpCacheSync(): void {
  if (listener) window.removeEventListener('lumen:mcp-command', listener)
  listener = null
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run src/shared/composables/useMcpCacheSync.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/shared/composables/useMcpCacheSync.ts src/shared/composables/useMcpCacheSync.test.ts
git commit -m "feat(webview): installMcpCacheSync invalidates issue queries on MCP writes"
```

---

## Task 6: Install for every window

**Files:**
- Modify: `src/main.ts`

- [ ] **Step 1: Add the import and install call**

Add the import beside the others:

```ts
import { installMcpCacheSync } from '@/shared/composables/useMcpCacheSync'
```

Then in `boot()`, immediately after `installServerHealth(queryClient)` (line 31) and **before** the `if (!route)` line, add:

```ts
  // Every window — main and popouts — refreshes its issue views when an MCP
  // write lands in the host. (Unlike app-state report, this is not main-only.)
  installMcpCacheSync(queryClient)
```

- [ ] **Step 2: Typecheck**

Run: `bun run typecheck`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/main.ts
git commit -m "feat(webview): install MCP cache sync in every window"
```

---

## Task 7: Full verification

- [ ] **Step 1: Format**

Run: `bun run format`

- [ ] **Step 2: Typecheck**

Run: `bun run typecheck`
Expected: exit 0.

- [ ] **Step 3: Full test suite**

Run: `bunx vitest run`
Expected: all green, including `src/bun/mcp` (77+ tests) and the new composable test.

- [ ] **Step 4: Commit any formatting**

```bash
git add -A && git commit -m "chore: format" || echo "nothing to format"
```

---

## Self-review notes

- **Spec coverage:** rpc union (T1), `emitInvalidate`/`broadcast` (T2/T3), per-tool emit (T4), webview installer + keys (T5), all-windows install (T6). Dirty preservation already tested (`useIssueDraft.test.ts:156`) — noted, no new task. ✔
- **Type consistency:** `InvalidateSignal = Omit<…, 'cmd'>`; tools call `emitInvalidate({ resource:'issue', project, iid? })`; installer reads `d.project` / `d.iid`; keys match `useIssue`/`useIssues`/`useWorkItemStatus`. ✔
- **No placeholders:** every code/command step is concrete. The Task 2 conditional-type detour is explicitly discarded in favor of the simple signature. ✔
