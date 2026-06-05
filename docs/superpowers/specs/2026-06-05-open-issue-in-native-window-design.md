# Open issues in a native window

## Goal

The issue drawer's **Expand** action currently navigates the main window to a
full-page `IssueDetail` route. Change it so Expand opens the issue in a new
**native OS window** (Electrobun `BrowserWindow`) instead.

- One window per issue: re-expanding an already-open issue focuses its existing
  window rather than spawning a duplicate.
- The issue window is a focused, single-issue view — its back-to-list arrow is
  suppressed.
- The main window keeps the list/board and the inline drawer unchanged.

## Entry points today

- Issue **rows** (`IssueRow.vue`) and **cards** (`IssueCard.vue`) link to
  `{ query: { issue: iid } }`, which opens the inline **drawer** (`IssueDrawer`
  hosting `IssueDetail` with `embedded: true`).
- The drawer's **Expand** button emits `expand` → `IssueList.expandIssue()` →
  `router.push({ name: 'issue', params: { fullPath, iid } })` → full-page
  `IssueDetail` (`embedded: false`).

Only Expand reaches the full page. Rows/cards never do. This change touches the
Expand path only.

## Design

### 1. Host side — `src/bun/`

The app builds a single `BrowserWindow` in `src/bun/index.ts` with an inline
`rpc` config.

- **Factor the rpc config into `buildRpc()`** — a function returning a fresh
  `BrowserView.defineRPC<any>({ ... })` carrying all existing request handlers.
  Each window (main window + every issue window) gets its own instance. The main
  window's behavior is unchanged; it now calls `buildRpc()` instead of
  referencing an inline const.

- **New request handler `openIssueWindow({ fullPath, iid })`:**
  - `key = \`${fullPath}#${iid}\`` indexed in a module-level
    `Map<string, BrowserWindow>` (`issueWindows`).
  - If `issueWindows.has(key)` → `win.activate()` and return `{ ok: true }`.
  - Otherwise:
    - `repo = fullPath.split('/').at(-1) ?? fullPath`
    - `url = issueWindowUrl(base, fullPath, iid)` (see below)
    - `const win = new BrowserWindow({ title: \`#${iid} · ${repo}\`, url, frame, rpc: buildRpc() })`
    - Frame cascades by `issueWindows.size` (e.g. base x/y + `size * 24`) so
      stacked windows don't fully overlap. Reasonable default size for a single
      issue (e.g. 720×900).
    - `issueWindows.set(key, win)`
    - `win.on('close', () => issueWindows.delete(key))` — the per-window close
      event (scoped by window id) cleans the registry.
    - Return `{ ok: true }`.

- **URL builder (pure, testable):**
  `issueWindowUrl(base: string, fullPath: string, iid: string): string`
  returns `` `${base}#/projects/${fullPath}/issues/${iid}?window=1` ``.
  - `base` is the same value `resolveStartUrl()` already produces for the main
    window, so it works for both HMR (`http://localhost:5273/index.html`) and
    the bundled app (`views://mainview/index.html`).
  - `fullPath` may contain slashes — fine, the `:fullPath(.*)` route matches them
    inside the hash.
  - Extracted into a small module with a unit test, matching the existing
    `startUrl.ts` / `menu.ts` testable-helper pattern.

### 2. RPC contract & webview bridge

- `src/lib/rpcContract.ts`: add to `LumenRequests`:
  ```ts
  openIssueWindow: (a: { fullPath: string; iid: string }) => Promise<{ ok: boolean }>
  ```
- `src/lib/rpc.ts`: add the passthrough
  `openIssueWindow: (a) => client().openIssueWindow(a)`.

### 3. `IssueList.vue` — `expandIssue()`

Replace the `router.push({ name: 'issue' })` + view-transition body with:

1. Keep the existing dirty-guard confirm (the drawer's unsaved in-memory edits
   would not carry into the fresh window, so a discard prompt still applies).
2. `await rpc.openIssueWindow({ fullPath: props.fullPath, iid })`.
3. Close the drawer by clearing `?issue=` from the query (same mechanism
   `setDrawerOpen(false)` uses), so the list is left clean with the issue now in
   its own window.

The `withViewTransition` / `router.push` / `nextTick` dance is removed from this
function.

### 4. `IssueDetail.vue` — windowed mode

- Add `const windowed = computed(() => route.query.window === '1')` (import
  `useRoute`; the view currently takes `fullPath`/`iid` via router props).
- Change the back-arrow from `v-if="!embedded"` to
  `v-if="!embedded && !windowed"`.
- Title-setting (`useTitle`) and the unsaved-edits `onBeforeRouteLeave` guard
  stay enabled — both are correct for a standalone window.

The `issue` route stays registered in `src/router/index.ts` (the window loads
it). Nothing in-app navigates to it anymore, but the route itself is unchanged.

### 5. Tests

- **`issueWindowUrl`** pure unit test: HMR base, bundled base, and a `fullPath`
  containing slashes all produce the expected `#/projects/.../issues/:iid?window=1`.
- **`IssueList`**: Expand calls `rpc.openIssueWindow` with `{ fullPath, iid }`,
  closes the drawer, and honors the dirty-confirm (no call when the user cancels
  the discard).
- **`IssueDetail`**: with `?window=1` the back-arrow is hidden; on the plain
  full-page route it still renders.

## Trade-offs

- Each issue window cold-boots the whole SPA — it re-runs the connect guard and
  refetches the issue, with no query cache shared with the main window. Expected
  for a separate native window and acceptable for a daily-driver desktop app.
- The native window title is host-set to `#<iid> · <repo>`. `IssueDetail`'s
  `useTitle` sets `document.title` too, but Electrobun does not bind that to the
  native title, so the host-set title is authoritative. Not worth a webview→host
  `setTitle` round-trip to reflect the full issue title.

## Out of scope

- No change to how rows/cards open the drawer.
- No change to the drawer itself.
- No multi-window state sync (each window is independent).
