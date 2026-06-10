# MCP App-Control Tools — Design

**Date:** 2026-06-10
**Status:** Approved
**Builds on:** `2026-06-09-mcp-server-design.md` (§App-Control Bridge, deferred at implementation)

## Goal

Let MCP agents see and drive the running app: read what's on screen, navigate
the main window, open native windows (single issue, multi-issue pager,
settings), and post native notifications. Six new tools alongside the existing
14 GitLab data tools.

## Decisions (vs. the original spec sketch)

- **Scope:** the spec's 4 tools **plus** window management
  (`lumen_app_open_issues_window`, `lumen_app_open_settings`) — every window
  type the host can already open gets a tool.
- **Windows:** `lumen_app_state` reports the main-window snapshot **plus** a
  host-side list of all open windows. Drive commands target the **main window
  only** (per the original spec: "App-control tools touch only the main
  window").
- **Navigate API:** semantic `view` enum + params, not raw route paths. Agents
  cannot land on internal routes (`/connect`, `/settings`); router refactors
  don't break the tool contract.
- **Bridge mechanics:** push-cache + CustomEvent (the spec's design). Both
  directions are already proven: webview→bun requests (all existing RPC) and
  bun→webview `executeJavascript` (serverHealth broadcast, settings menu
  action). No new framework capability.

## Tools — `src/bun/mcp/app/tools.ts`

| Tool | Args | Action |
|---|---|---|
| `lumen_app_state` | — | Cached webview snapshot + host window list |
| `lumen_app_navigate` | `view` (enum), `project?`, `iid?` | CustomEvent → main webview router |
| `lumen_app_open_issue` | `project`, `iid` | Host `openIssueWindow()` directly |
| `lumen_app_open_issues_window` | `project`, `iids` (string[]) | Host `openIssuesWindow()` |
| `lumen_app_open_settings` | — | Host `openSettingsWindow()` |
| `lumen_app_notify` | `title`, `body?`, `subtitle?`, `silent?` | Host `Utils.showNotification` |

- `view` enum: `dashboard | projects | issues | issue | merge-requests |
  merge-request | pipelines`. `project` required for project-scoped views;
  `iid` required for `issue` / `merge-request`. Zod-validated; `iid` is a
  **string** (matches the GitLab tools' convention).
- The three window-opener tools call host functions directly — no webview
  involvement; they work even if the main window is closed.
- Drives are fire-and-forget; the agent re-reads `lumen_app_state` to confirm.

## Bridge — `src/bun/mcp/app/bridge.ts`

Host-side module, no SDK imports (testable in isolation):

- `cacheSnapshot(snapshot)` — called by the new `reportAppState` RPC handler.
- `getSnapshot()` — returns the latest snapshot or `null` before first report.
- `buildCommandJs(command)` — returns the `executeJavascript` payload string:
  `window.dispatchEvent(new CustomEvent('lumen:mcp-command', { detail: … }))`
  with the command JSON-serialized (single point that owns escaping).

Snapshot shape (shared type in `rpcContract.ts`):

```ts
interface AppStateSnapshot {
  route: string            // current route path
  view: string             // route name
  projectPath: string | null
  selectedIssueIids: string[]   // multi-select state, [] when none
  visibleIssueIids: string[]    // iids rendered in the current list/board
}
```

Window list comes from the host's existing `windows` tracking in
`src/bun/index.ts`, exposed via a small accessor `listWindows()` returning
`{ kind: 'main' | 'issue' | 'issues-window' | 'settings', key?: string }[]`.
`lumen_app_state` returns `{ snapshot, windows }`.

## Webview side

- **Report:** `installAppStateReport(router)` in
  `src/shared/composables/useAppStateReport.ts` — watches route +
  issue-selection state, pushes `rpc.reportAppState(snapshot)` debounced
  (~150 ms trailing). Installed from `main.ts` in the **main window only**
  (skip when `?window=` is present, same gate as other main-window-only
  installs).
- **Drive:** the same composable registers a `window` listener for
  `lumen:mcp-command`. v1 command set: `{ cmd: 'navigate', view, project?,
  iid? }` → mapped to `router.push({ name, params })`. Unknown commands are
  ignored (forward compatibility).
- Popout/settings windows never report and never listen; the bridge state is
  main-window state by construction.

## RPC contract — `src/shared/lib/rpcContract.ts`

- New request `reportAppState(snapshot: AppStateSnapshot): void` on
  `LumenRequests`; handler registered host-side in `src/bun/index.ts` next to
  the existing handlers, body delegates to `bridge.cacheSnapshot`.
- `AppStateSnapshot` and `McpAppCommand` types live here so both sides stay
  typed.

## Error handling

- Drive with no main window: no-op success with `note: "main window not
  open"` in the tool result — `lumen_app_state` reflects reality.
- `lumen_app_state` before any report: `{ snapshot: null, windows: [...] }`.
- Tool handlers never throw raw; same MCP error mapping as the GitLab tools
  (validation errors via zod, host failures as tool errors, token never
  leaked).

## Testing

Mirrors the existing per-module pattern (`src/bun/mcp/gitlab/*.test.ts`):

- **bridge.test.ts** — cache set/get; `buildCommandJs` escaping (quotes,
  unicode, injection-shaped strings).
- **app/tools.test.ts** — arg validation (enum, required params per view);
  handler mapping with host functions stubbed; no-main-window note path.
- **registry.test.ts** — updated tool count (20) and `lumen_app_*` names
  present.
- **useAppStateReport.test.ts** — debounced report on route/selection change;
  command listener routes `navigate` and ignores unknown commands; not
  installed in windowed mode.

## Out of scope

- Driving non-main windows (needs window addressing — revisit if needed).
- Rich reads of list contents/filters beyond visible iids.
- Synchronous state pull (would need an `executeJavascript` return path).
