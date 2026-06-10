# MCP Server — Design

**Date:** 2026-06-09
**Status:** Approved (design); implementation pending

## Summary

Lumen (an Electrobun desktop app over self-hosted GitLab) will host an
in-process **MCP server** so external agents (Claude Code, etc.) can both
**work with GitLab data** and **drive the running app**. The server lives in the
Bun main process, is **off by default**, and — when enabled in Settings — listens
on `127.0.0.1` over streamable HTTP behind a bearer token.

The Bun process already holds the GitLab credentials and the
`gitlabGraphql`/`gitlabRest`/`gitlabAsset` client, so GitLab tools are a direct
reuse. App-control tools touch only the main window.

## Goals

- A "full suite" of GitLab tools: issues (full CRUD), merge requests (read +
  triage), labels & milestones, users & search.
- App-control tools: read what's on screen, navigate, open issue windows, notify.
- Safe by default: opt-in, localhost-only, bearer-authenticated.
- Isolated, unit-testable module that does not couple to the Vue layer.

## Non-Goals

- No stdio transport in v1 (the app is a long-running GUI; HTTP fits). A stdio
  shim can be added later if a client requires it.
- No destructive MR actions (merge) in v1 — flagged as a future opt-in.
- No reuse of Vue composables headlessly (they are reactive, not callable
  outside a component).

## Decisions (from brainstorming)

- **Surface:** both GitLab data *and* app control.
- **Transport:** local HTTP, in-app (streamable HTTP over `Bun.serve`).
- **GitLab domains:** issues (CRUD), merge requests, labels & milestones,
  users & search.
- **Lifecycle/auth:** opt-in via Settings; `127.0.0.1` bind + generated bearer
  token.
- **Build approach (A):** `@modelcontextprotocol/sdk` `Server` +
  `StreamableHTTPServerTransport`; self-contained `src/bun/mcp/` module reusing
  the existing GitLab client. (Rejected: B hand-rolled protocol — protocol/
  validation risk; C proxy into the webview — couples to a live webview and
  reactive composables.)

## Architecture

```
Claude Code / agent
      │  streamable HTTP + Bearer
      ▼
Bun.serve 127.0.0.1:PORT ── auth gate ── MCP Server (SDK)
      │                                      │
      │ gitlab tools                         │ app tools
      ▼                                      ▼
gitlabGraphql/gitlabRest  ───►GitLab    executeJavascript ──► webview (drive)
(existing, src/bun)                     reportAppState  ◄──── webview (read, cached)
```

A new module, `src/bun/mcp/`, is started from `src/bun/index.ts` **only when
enabled in config**. It owns the MCP `Server`, a tool **registry**, an **auth
gate**, and two tool families (`gitlab/`, `app/`).

## Module Layout

```
src/bun/mcp/
  server.ts        # start/stop lifecycle, Bun.serve + transport wiring, auth gate
  registry.ts      # collect tools, expose tools/list + tools/call to the SDK
  auth.ts          # bearer token generate/verify
  gitlab/
    client.ts      # thin typed query/mutation builders over gitlabGraphql/gitlabRest
    issues.ts      # issue tools
    mergeRequests.ts
    labelsMilestones.ts
    usersSearch.ts
  app/
    bridge.ts      # state cache (from reportAppState) + command push (executeJavascript)
    tools.ts       # navigate / open issue / read current view / notify
  types.ts         # ToolDef, shared shapes
```

Each file is one focused unit with its own `*.test.ts`, matching repo
convention.

A `ToolDef` is `{ name, description, inputSchema, handler }`. The registry
collects every tool, answers `tools/list`, and dispatches `tools/call` to the
matching handler with validated args.

## Lifecycle & Security

- `config.json` gains `mcp: { enabled: boolean; port: number; token: string |
  null }`. Same file, written `0600` (as today).
- **Off by default.** Enabling in Settings generates a token (if absent) and
  starts the server; disabling stops it. Toggling never touches the GitLab
  token.
- `Bun.serve` binds **`127.0.0.1` only**. Every request must carry
  `Authorization: Bearer <token>`; the gate rejects (`401`) before the request
  reaches the SDK. Default port `7437`, editable in Settings; if the port is in
  use, surface an error in Settings rather than silently roaming.
- `src/bun/index.ts` calls `startMcpIfEnabled()` after the window boots. The
  extended `saveConfig`/`setMcpEnabled` path starts/stops on toggle. Start/stop
  is idempotent.

## Tool Catalog

Naming: `lumen_<domain>_<verb>`. Reads return compact JSON; writes return the
mutated entity plus a confirmation line. Every handler maps args → a builder in
`gitlab/client.ts`, calls the existing `gitlabGraphql`/`gitlabRest`, and
normalizes errors using the same 401/503 semantics `src/gitlab/errors.ts`
already encodes, surfaced as MCP tool errors.

### Issues — `gitlab/issues.ts`
- `lumen_issues_list` — filter by project, state, labels, assignee, milestone,
  search, pagination. Returns slim rows (iid, title, state, labels, assignees,
  updatedAt, webUrl).
- `lumen_issue_get` — full detail incl. description (markdown), labels,
  assignees, milestone, discussions.
- `lumen_issue_create` — project, title, description, labels?, assignees?,
  milestone?.
- `lumen_issue_update` — iid + any of title / description / state
  (`close`/`reopen`) / labels (add/remove) / assignees / milestone.
- `lumen_issue_comment` — iid + body.

### Merge requests — `gitlab/mergeRequests.ts`
- `lumen_mrs_list` — filter by project, state, author, reviewer, labels, search.
- `lumen_mr_get` — detail incl. description, diff stats / changed paths,
  discussions, approval state.
- `lumen_mr_comment` — note body.
- `lumen_mr_review` — approve / unapprove (REST). Merge is intentionally
  out for v1.

### Labels & milestones — `gitlab/labelsMilestones.ts`
- `lumen_labels_list` — project (+ ancestor group) labels.
- `lumen_milestones_list` — project milestones, filter by state.

### Users & search — `gitlab/usersSearch.ts`
- `lumen_me` — current user (the token's identity).
- `lumen_members_list` — project members, for assignee/reviewer lookup.
- `lumen_search` — global/project search across issues/MRs (scope param).

## App-Control Bridge

Built from the two **proven** RPC directions — no new framework capability. The
webview RPC is today request-response only (webview→bun) with empty handlers;
the host→webview path is `executeJavascript` (already used for the settings
menu).

- **Read path (cached):** the webview pushes a snapshot to the host on change
  via a new webview→bun request handler `reportAppState(snapshot)`. `bridge.ts`
  caches the latest. Snapshot shape: `{ route, projectPath, view,
  selectedIssueIid, visibleIssueIids, openWindows }`. Read tools return the
  cache instantly (no synchronous webview round-trip).
- **Drive path (push):** host → webview via
  `win.webview.executeJavascript("window.dispatchEvent(new
  CustomEvent('lumen:mcp-command', {detail: …}))")`. The webview registers a
  listener that routes commands to the router/composables.

New RPC methods are added to `src/shared/lib/rpcContract.ts` so both sides stay
typed. The webview registers `reportAppState` as an outbound push and a
`lumen:mcp-command` listener inbound.

### App tools — `app/tools.ts`
- `lumen_app_state` — return the cached snapshot (what's on screen now).
- `lumen_app_navigate` — go to a route/view (project issues, dashboard, an
  issue).
- `lumen_app_open_issue` — open the native single-issue window (reuses
  `openIssueWindow`).
- `lumen_app_notify` — native notification (reuses `showNotification`).

Drives are fire-and-forget; the agent re-reads `lumen_app_state` to confirm.

## Settings UI

A new **"Agent access (MCP)"** section in `src/shared/components/SettingsDialog.vue`:
- Enable toggle → extended `saveConfig` / new `setMcpEnabled` RPC; host
  starts/stops the server.
- Port field (default `7437`).
- Token row: masked, with **copy** and **regenerate** (regenerate invalidates
  the old token and restarts).
- A copyable **client config snippet** (URL + bearer header) for pasting into an
  MCP client.
- Status line: running / stopped / port-in-use error.

`useSettings.ts` / config-status plumbing extends to carry `{ mcpEnabled,
mcpPort, mcpRunning, hasToken }` — never the token itself except immediately
after reveal/copy.

## Error Handling

- GitLab transport failures map as today: unreachable → `503` →
  `unavailable`; `401` → auth error. Tool handlers translate these into MCP
  tool errors with a clear message; they never leak the token.
- Auth gate returns `401` for missing/wrong bearer before the SDK is involved.
- Port-in-use on start is reported to Settings (status line), not retried on a
  random port.
- App-drive commands are best-effort; if the webview is gone, the command is a
  no-op and `lumen_app_state` reflects reality.

## Testing

- **gitlab tools:** unit-test each handler's arg→builder mapping and response
  normalization with `gitlabGraphql` stubbed (mirrors `src/bun/gitlab.test.ts`).
  No live GitLab.
- **registry/auth:** `tools/list` shape; bearer gate accepts/rejects;
  bind-host assertion.
- **bridge:** `reportAppState` caches; command push formats the right
  `executeJavascript` payload.
- **server lifecycle:** start/stop idempotency; toggle via config.
- **webview side:** the `lumen:mcp-command` listener routing (vitest + jsdom,
  like existing tests).
- Run with `bunx vitest run`. End-to-end against a real MCP client is a manual
  smoke step.

## Risks

- **SDK under Electrobun's bundled Bun:** verify `@modelcontextprotocol/sdk`'s
  streamable-HTTP transport runs clean under the bundler during implementation.
  Fallback: a thin hand-rolled JSON-RPC layer over `Bun.serve` for *transport
  only*, leaving the tool registry unchanged.
- **Query/codegen workflow:** new GraphQL operations require a user-run `bun
  codegen` against the live instance; typecheck stays red until then (known
  project constraint). The MCP `gitlab/client.ts` builders may hand-write
  queries to avoid blocking on codegen — to be decided in the plan.
- **Webview snapshot freshness:** read tools are only as current as the last
  `reportAppState` push; the webview must push on every relevant route/selection
  change.

## Open Questions (resolve in plan)

- Hand-written GraphQL strings vs. generated documents for MCP builders.
- Exact snapshot fields the webview can cheaply produce.
- Whether `lumen_mr_review` uses GraphQL or REST approve endpoints.
