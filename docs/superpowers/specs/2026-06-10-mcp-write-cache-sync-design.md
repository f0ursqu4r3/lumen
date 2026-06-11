# MCP write → cross-view cache refresh

**Date:** 2026-06-10
**Status:** Approved, ready for plan

## Problem

MCP issue mutations (`lumen_issue_update`, `lumen_issue_set_status`,
`lumen_issue_comment`, `lumen_issue_create`) run in the Bun host process and hit
GitLab directly via the host's GraphQL client. The webviews' TanStack Query
caches are a separate world and are never told about these writes, so every open
view of the affected issue — the issue list/board, the issue detail rail, and any
native popout/pager window — shows stale data until the user manually refetches.

A user may be **live-editing** an issue (an unsaved, "dirty" draft) when an MCP
write lands on that same issue. Refreshing must never discard their in-flight
work.

## Goal

After a successful MCP issue mutation, every window that displays the affected
issue (or its project's list) refetches and reflects the change — while any dirty
draft keeps its unsaved edits.

## Non-goals

- Merge request mutations. The signal is designed to extend to them (`resource`
  field), but wiring MR tools is a separate follow-up.
- Any "this issue changed externally" UI indicator. Per product decision the
  refresh is silent; dirty edits are simply preserved.
- Changing how the app's *own* (in-webview) mutations invalidate cache — they
  already do, via their mutation `onSuccess`/`onSettled` handlers.

## Architecture

The host already broadcasts JS into every native window via `broadcast()`
(`src/bun/index.ts:52`). Webviews already listen for `lumen:mcp-command`
CustomEvents (currently only `navigate`, handled main-window-only in
`useAppStateReport`). We reuse both rails.

```
MCP issue tool (host)
  └─ mutation succeeds
       └─ emitInvalidate({ resource:'issue', project, iid? })
            └─ host.broadcast( buildCommandJs(signal) )   // every window
                 └─ window dispatches 'lumen:mcp-command'
                      └─ installMcpCacheSync listener (every window)
                           └─ queryClient.invalidateQueries(...)
                                └─ active queries refetch
                                     └─ useIssueDraft watcher syncs IFF clean
```

### Host side (`src/bun/`)

1. **`rpcContract.ts`** — `McpAppCommand` becomes a discriminated union:
   ```ts
   export type McpAppCommand =
     | { cmd: 'navigate'; view: string; project?: string; iid?: string }
     | { cmd: 'invalidate'; resource: 'issue'; project: string; iid?: string }
   ```

2. **`mcp/app/bridge.ts`** —
   - Add `broadcast: (js: string) => void` to `HostActions`.
   - Add `emitInvalidate(signal: Extract<McpAppCommand, { cmd: 'invalidate' }>)`
     that calls `host?.broadcast(buildCommandJs(signal))` and no-ops when no host
     is set (tests, headless, app still booting). `buildCommandJs` is reused
     unchanged — `JSON.stringify` already serializes the new shape.

3. **`index.ts`** — wire the new `broadcast` host action to the existing
   `broadcast()` helper when constructing `HostActions`.

4. **`mcp/gitlab/issues.ts`** — on the success path of each issue mutation, call
   `emitInvalidate`:
   - `lumen_issue_update` → `{ resource:'issue', project, iid }`
   - `lumen_issue_set_status` → `{ resource:'issue', project, iid }`
   - `lumen_issue_comment` → `{ resource:'issue', project, iid }`
   - `lumen_issue_create` → `{ resource:'issue', project }` (no iid → list only)

   Emit strictly after success; never alongside an `errorResult` return.

### Webview side (`src/`)

5. **`shared/composables/useMcpCacheSync.ts`** (new) —
   `installMcpCacheSync(queryClient: QueryClient): void` adds a
   `lumen:mcp-command` listener that ignores anything but `cmd === 'invalidate'`
   / `resource === 'issue'`, then invalidates:
   - always `['issues', project]` (list + board share this key)
   - when `iid` present: `['issue', project, iid]` and
     `['workItemStatus', project, iid]`

   It does **not** invalidate `['workItemStatuses', groupPath]` (the status
   *catalog* is unchanged by a per-issue mutation). Exposes a test-only
   uninstall mirroring the `__reset*` pattern used elsewhere.

6. **`main.ts`** — call `installMcpCacheSync(queryClient)` unconditionally for
   **every** window, beside `installServerHealth(queryClient)` (i.e. not gated on
   `route`, unlike `installAppStateReport`). Popouts and the pager must refresh
   too.

## Dirty-edit preservation — no new mechanism

`invalidateQueries` refetches the active `['issue', …]` query. `useIssueDraft`'s
existing watcher re-seeds the draft from the server **only while clean**:

```ts
watch([issue, () => statusState.value], () => {
  if (!draft.value || !dirty.value) sync()
}, { immediate: true })
```

A dirty draft is skipped, so the refetch cannot clobber unsaved edits; the fresh
server data sits in cache and is adopted on the user's next save/cancel. The
"don't lose work" requirement is already guaranteed by the draft architecture —
this feature only supplies the trigger. A regression test locks this in.

`invalidateQueries` only auto-refetches *active* (mounted) queries; inactive ones
(e.g. a list not currently mounted in some popout) are marked stale and refetch
on next mount — the desired behavior, no wasted work.

## Testing (TDD)

- **`bridge.ts`** — `emitInvalidate` calls `host.broadcast` with the JS produced
  by `buildCommandJs(signal)`; no-ops (no throw) when host is unset.
- **`issues.ts`** — each mutation calls `emitInvalidate` with the correct signal
  on success, and does **not** call it when the mutation returns an error result.
  (`emitInvalidate` mocked at the bridge boundary.)
- **`useMcpCacheSync.ts`** — dispatching an `invalidate` event invalidates the
  expected keys with and without `iid`; `navigate` and unknown cmds are ignored.
- **`useIssueDraft.ts`** — a dirty draft is unchanged when its backing `issue`
  ref updates (refetch-while-dirty); confirms preservation. Add if not already
  covered.

## Files touched

- `src/shared/lib/rpcContract.ts` (command union)
- `src/bun/mcp/app/bridge.ts` (`broadcast` action, `emitInvalidate`)
- `src/bun/index.ts` (wire `broadcast`)
- `src/bun/mcp/gitlab/issues.ts` (emit on success)
- `src/shared/composables/useMcpCacheSync.ts` (new installer)
- `src/main.ts` (install for all windows)
- plus the four matching test files.
